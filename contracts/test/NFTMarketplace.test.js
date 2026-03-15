const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NFTMarketplace", function () {
  let nft, marketplace, owner, alice, bob, charlie;
  const PRICE = ethers.parseEther("1");
  const ROYALTY_FEE = 500; // 5%

  beforeEach(async () => {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    nft = await NFTCollection.deploy();

    const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    marketplace = await NFTMarketplace.deploy();

    // Alice mints token 0 with 5% royalty
    await nft.connect(alice).mintNFT(alice.address, "ipfs://test", ROYALTY_FEE);
    // Approve marketplace
    await nft.connect(alice).approve(await marketplace.getAddress(), 0);
  });

  // ── Fixed-price listings ─────────────────────────────────────────

  describe("Fixed-price listings", () => {
    it("should list an NFT", async () => {
      const mktAddr = await marketplace.getAddress();
      await expect(
        marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE)
      )
        .to.emit(marketplace, "Listed")
        .withArgs(0, alice.address, await nft.getAddress(), 0, PRICE);

      const listing = await marketplace.listings(0);
      expect(listing.seller).to.equal(alice.address);
      expect(listing.price).to.equal(PRICE);
      expect(listing.active).to.be.true;
    });

    it("should reject listing without approval", async () => {
      // Bob mints but doesn't approve
      await nft.connect(bob).mintNFT(bob.address, "ipfs://bob", 0);
      await expect(
        marketplace.connect(bob).listNFT(await nft.getAddress(), 1, PRICE)
      ).to.be.revertedWith("Marketplace not approved");
    });

    it("should reject listing with zero price", async () => {
      await expect(
        marketplace.connect(alice).listNFT(await nft.getAddress(), 0, 0)
      ).to.be.revertedWith("Price must be > 0");
    });

    it("should allow buying a listed NFT", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE);

      const ownerBalBefore = await ethers.provider.getBalance(owner.address);
      const aliceBalBefore = await ethers.provider.getBalance(alice.address);

      await expect(
        marketplace.connect(bob).buyNFT(0, { value: PRICE })
      )
        .to.emit(marketplace, "Sold")
        .withArgs(0, bob.address, PRICE);

      // Bob now owns the NFT
      expect(await nft.ownerOf(0)).to.equal(bob.address);

      // Platform fee: 2.5% of 1 ETH = 0.025 ETH
      const ownerBalAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerBalAfter - ownerBalBefore).to.equal(ethers.parseEther("0.025"));

      // Royalty: 5% of 1 ETH = 0.05 ETH goes to alice (creator)
      // Seller proceeds: 1 - 0.025 - 0.05 = 0.925 ETH (also to alice since she's both)
      const aliceBalAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceBalAfter - aliceBalBefore).to.equal(ethers.parseEther("0.975"));
    });

    it("should reject incorrect payment", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE);
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Incorrect price");
    });

    it("should reject seller buying own NFT", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE);
      await expect(
        marketplace.connect(alice).buyNFT(0, { value: PRICE })
      ).to.be.revertedWith("Seller cannot buy own NFT");
    });

    it("should allow cancelling a listing", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE);

      await expect(marketplace.connect(alice).cancelListing(0))
        .to.emit(marketplace, "ListingCancelled")
        .withArgs(0);

      const listing = await marketplace.listings(0);
      expect(listing.active).to.be.false;
    });

    it("should reject cancel from non-seller", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE);
      await expect(
        marketplace.connect(bob).cancelListing(0)
      ).to.be.revertedWith("Not the seller");
    });
  });

  // ── Auctions ─────────────────────────────────────────────────────

  describe("Auctions", () => {
    const START_PRICE = ethers.parseEther("0.5");
    const DURATION = 3600; // 1 hour

    it("should create an auction", async () => {
      await expect(
        marketplace.connect(alice).createAuction(
          await nft.getAddress(), 0, START_PRICE, DURATION
        )
      ).to.emit(marketplace, "AuctionCreated");

      // NFT is escrowed in marketplace
      expect(await nft.ownerOf(0)).to.equal(await marketplace.getAddress());
    });

    it("should accept bids", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await expect(
        marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.6") })
      )
        .to.emit(marketplace, "BidPlaced")
        .withArgs(0, bob.address, ethers.parseEther("0.6"));
    });

    it("should reject bid below start price", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await expect(
        marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Bid below start price");
    });

    it("should reject bid lower than current highest", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );
      await marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.6") });

      await expect(
        marketplace.connect(charlie).placeBid(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Bid too low");
    });

    it("should refund outbid bidder via pendingWithdrawals", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.6") });
      await marketplace.connect(charlie).placeBid(0, { value: ethers.parseEther("0.8") });

      // Bob's bid should be available for withdrawal
      expect(await marketplace.pendingWithdrawals(bob.address))
        .to.equal(ethers.parseEther("0.6"));

      // Bob withdraws
      const balBefore = await ethers.provider.getBalance(bob.address);
      await marketplace.connect(bob).withdraw();
      const balAfter = await ethers.provider.getBalance(bob.address);

      // Balance increased (minus gas)
      expect(balAfter).to.be.greaterThan(balBefore);
      expect(await marketplace.pendingWithdrawals(bob.address)).to.equal(0);
    });

    it("should end auction and transfer NFT to winner", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("1") });

      // Fast-forward past auction end
      await time.increase(DURATION + 1);

      await expect(marketplace.endAuction(0))
        .to.emit(marketplace, "AuctionEnded")
        .withArgs(0, bob.address, ethers.parseEther("1"));

      expect(await nft.ownerOf(0)).to.equal(bob.address);
    });

    it("should return NFT to seller if no bids", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await time.increase(DURATION + 1);
      await marketplace.endAuction(0);

      expect(await nft.ownerOf(0)).to.equal(alice.address);
    });

    it("should reject ending auction before expiry", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await expect(marketplace.endAuction(0))
        .to.be.revertedWith("Auction not yet expired");
    });

    it("should reject seller bidding on own auction", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await expect(
        marketplace.connect(alice).placeBid(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Seller cannot bid");
    });
  });

  // ── Admin ────────────────────────────────────────────────────────

  describe("Admin", () => {
    it("should allow owner to update platform fee", async () => {
      await marketplace.connect(owner).setPlatformFee(100); // 1%
      expect(await marketplace.platformFeeBps()).to.equal(100);
    });

    it("should reject fee above max", async () => {
      await expect(
        marketplace.connect(owner).setPlatformFee(1001)
      ).to.be.revertedWith("Fee too high");
    });

    it("should reject non-owner setting fee", async () => {
      await expect(
        marketplace.connect(alice).setPlatformFee(100)
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });
  });
});
