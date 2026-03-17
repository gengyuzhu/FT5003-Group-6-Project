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
    it("should list an NFT (no expiry)", async () => {
      await expect(
        marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0)
      )
        .to.emit(marketplace, "Listed")
        .withArgs(0, alice.address, await nft.getAddress(), 0, PRICE, 0);

      const listing = await marketplace.listings(0);
      expect(listing.seller).to.equal(alice.address);
      expect(listing.price).to.equal(PRICE);
      expect(listing.active).to.be.true;
      expect(listing.expiration).to.equal(0);
    });

    it("should list an NFT with expiration", async () => {
      const duration = 86400; // 1 day
      const tx = await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, duration);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const listing = await marketplace.listings(0);
      expect(listing.expiration).to.equal(block.timestamp + duration);
    });

    it("should reject listing without approval", async () => {
      await nft.connect(bob).mintNFT(bob.address, "ipfs://bob", 0);
      await expect(
        marketplace.connect(bob).listNFT(await nft.getAddress(), 1, PRICE, 0)
      ).to.be.revertedWithCustomError(marketplace, "MarketplaceNotApproved");
    });

    it("should reject listing with zero price", async () => {
      await expect(
        marketplace.connect(alice).listNFT(await nft.getAddress(), 0, 0, 0)
      ).to.be.revertedWithCustomError(marketplace, "PriceZero");
    });

    it("should allow buying a listed NFT (pull-payment)", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);

      await expect(
        marketplace.connect(bob).buyNFT(0, { value: PRICE })
      )
        .to.emit(marketplace, "Sold")
        .withArgs(0, bob.address, PRICE);

      // Bob now owns the NFT
      expect(await nft.ownerOf(0)).to.equal(bob.address);

      // Funds are in pendingWithdrawals (pull-payment)
      // Platform fee: 2.5% of 1 ETH = 0.025 ETH → owner
      const ownerPending = await marketplace.pendingWithdrawals(owner.address);
      expect(ownerPending).to.equal(ethers.parseEther("0.025"));

      // Royalty: 5% of 1 ETH = 0.05 ETH → alice (creator)
      // Seller proceeds: 1 - 0.025 - 0.05 = 0.925 ETH → alice (seller = creator)
      // Total for alice: 0.05 + 0.925 = 0.975 ETH
      const alicePending = await marketplace.pendingWithdrawals(alice.address);
      expect(alicePending).to.equal(ethers.parseEther("0.975"));
    });

    it("should allow withdrawing accumulated funds", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);
      await marketplace.connect(bob).buyNFT(0, { value: PRICE });

      // Owner withdraws platform fee
      const ownerBalBefore = await ethers.provider.getBalance(owner.address);
      await marketplace.connect(owner).withdraw();
      const ownerBalAfter = await ethers.provider.getBalance(owner.address);
      // Balance increased (minus gas), pending now 0
      expect(ownerBalAfter).to.be.greaterThan(ownerBalBefore);
      expect(await marketplace.pendingWithdrawals(owner.address)).to.equal(0);

      // Alice withdraws royalty + seller proceeds
      const aliceBalBefore = await ethers.provider.getBalance(alice.address);
      await marketplace.connect(alice).withdraw();
      const aliceBalAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceBalAfter).to.be.greaterThan(aliceBalBefore);
      expect(await marketplace.pendingWithdrawals(alice.address)).to.equal(0);
    });

    it("should reject incorrect payment", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWithCustomError(marketplace, "IncorrectPrice");
    });

    it("should reject seller buying own NFT", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);
      await expect(
        marketplace.connect(alice).buyNFT(0, { value: PRICE })
      ).to.be.revertedWithCustomError(marketplace, "SellerCannotBuy");
    });

    it("should allow cancelling a listing", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);

      await expect(marketplace.connect(alice).cancelListing(0))
        .to.emit(marketplace, "ListingCancelled")
        .withArgs(0);

      const listing = await marketplace.listings(0);
      expect(listing.active).to.be.false;
    });

    it("should reject cancel from non-seller", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);
      await expect(
        marketplace.connect(bob).cancelListing(0)
      ).to.be.revertedWithCustomError(marketplace, "NotTheSeller");
    });
  });

  // ── Listing Expiration ─────────────────────────────────────────

  describe("Listing Expiration", () => {
    it("listing with expiration=0 never expires", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);

      // Fast-forward 30 days
      await time.increase(30 * 86400);

      // Should still be buyable
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: PRICE })
      ).to.emit(marketplace, "Sold");
    });

    it("listing with future expiration is buyable", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 86400); // 1 day

      // Buy before expiry
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: PRICE })
      ).to.emit(marketplace, "Sold");
    });

    it("listing with past expiration reverts on buyNFT", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 3600); // 1 hour

      // Fast-forward past expiry
      await time.increase(3601);

      await expect(
        marketplace.connect(bob).buyNFT(0, { value: PRICE })
      ).to.be.revertedWithCustomError(marketplace, "ListingExpiredError");
    });

    it("isListingExpired returns correct value", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 3600);

      expect(await marketplace.isListingExpired(0)).to.be.false;

      await time.increase(3601);

      expect(await marketplace.isListingExpired(0)).to.be.true;
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
      ).to.be.revertedWithCustomError(marketplace, "BidBelowStartPrice");
    });

    it("should reject bid without minimum 5% increment", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );
      // First bid at 0.6 ETH
      await marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.6") });

      // 5% of 0.6 = 0.03, so minimum next bid = 0.63 ETH
      // Bid at 0.62 ETH should fail (below 5% increment)
      await expect(
        marketplace.connect(charlie).placeBid(0, { value: ethers.parseEther("0.62") })
      ).to.be.revertedWithCustomError(marketplace, "BidIncrementTooLow");
    });

    it("should accept bid at exactly 5% increment", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );
      await marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.6") });

      // 5% of 0.6 = 0.03, minimum next bid = 0.63 ETH
      await expect(
        marketplace.connect(charlie).placeBid(0, { value: ethers.parseEther("0.63") })
      ).to.emit(marketplace, "BidPlaced");
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

    it("should end auction and distribute funds via pull-payment", async () => {
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

      // Check funds accumulated in pendingWithdrawals
      // Platform fee: 2.5% of 1 ETH = 0.025 ETH
      expect(await marketplace.pendingWithdrawals(owner.address)).to.equal(ethers.parseEther("0.025"));
      // Alice gets royalty (5% = 0.05) + seller proceeds (0.925) = 0.975 ETH
      expect(await marketplace.pendingWithdrawals(alice.address)).to.equal(ethers.parseEther("0.975"));
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
        .to.be.revertedWithCustomError(marketplace, "AuctionNotExpired");
    });

    it("should reject seller bidding on own auction", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await expect(
        marketplace.connect(alice).placeBid(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "SellerCannotBid");
    });
  });

  // ── Pausable ─────────────────────────────────────────────────────

  describe("Pausable", () => {
    it("owner can pause and unpause", async () => {
      await marketplace.connect(owner).pause();
      // Verify paused state by trying to list
      await expect(
        marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0)
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");

      await marketplace.connect(owner).unpause();
      // Should work again after unpause
      await expect(
        marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0)
      ).to.emit(marketplace, "Listed");
    });

    it("paused marketplace rejects all mutating operations", async () => {
      // First create a listing and auction before pausing
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);

      // Mint another token for auction test
      await nft.connect(bob).mintNFT(bob.address, "ipfs://bob", 0);
      await nft.connect(bob).approve(await marketplace.getAddress(), 1);

      await marketplace.connect(owner).pause();

      // All these should revert with EnforcedPause
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: PRICE })
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");

      await expect(
        marketplace.connect(alice).cancelListing(0)
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");

      await expect(
        marketplace.connect(bob).createAuction(await nft.getAddress(), 1, PRICE, 3600)
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");
    });

    it("non-owner cannot pause", async () => {
      await expect(
        marketplace.connect(alice).pause()
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });
  });

  // ── Pull-Payment ─────────────────────────────────────────────────

  describe("Pull-Payment", () => {
    it("withdraw with zero balance reverts", async () => {
      await expect(
        marketplace.connect(bob).withdraw()
      ).to.be.revertedWithCustomError(marketplace, "NothingToWithdraw");
    });

    it("separate royalty receiver and seller both get correct amounts", async () => {
      // Alice mints token 1 with 5% royalty (alice is creator/royalty receiver)
      await nft.connect(alice).mintNFT(alice.address, "ipfs://test2", ROYALTY_FEE);
      // Transfer token 1 to bob (bob becomes seller, alice stays royalty receiver)
      await nft.connect(alice).transferFrom(alice.address, bob.address, 1);
      await nft.connect(bob).approve(await marketplace.getAddress(), 1);

      // Bob lists token 1
      await marketplace.connect(bob).listNFT(await nft.getAddress(), 1, PRICE, 0);

      // Charlie buys
      await marketplace.connect(charlie).buyNFT(0, { value: PRICE });

      // Platform fee: 2.5% = 0.025 ETH → owner
      expect(await marketplace.pendingWithdrawals(owner.address)).to.equal(ethers.parseEther("0.025"));
      // Royalty: 5% = 0.05 ETH → alice (creator)
      expect(await marketplace.pendingWithdrawals(alice.address)).to.equal(ethers.parseEther("0.05"));
      // Seller proceeds: 1 - 0.025 - 0.05 = 0.925 ETH → bob (seller)
      expect(await marketplace.pendingWithdrawals(bob.address)).to.equal(ethers.parseEther("0.925"));
    });
  });

  // ── Update Listing Price ─────────────────────────────────────────

  describe("Update Listing Price", () => {
    it("should allow seller to update listing price", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);
      const newPrice = ethers.parseEther("2");

      await expect(marketplace.connect(alice).updateListingPrice(0, newPrice))
        .to.emit(marketplace, "ListingPriceUpdated")
        .withArgs(0, PRICE, newPrice);

      const listing = await marketplace.listings(0);
      expect(listing.price).to.equal(newPrice);
    });

    it("should reject update from non-seller", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);
      await expect(
        marketplace.connect(bob).updateListingPrice(0, ethers.parseEther("2"))
      ).to.be.revertedWithCustomError(marketplace, "NotTheSeller");
    });

    it("should reject update to zero price", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);
      await expect(
        marketplace.connect(alice).updateListingPrice(0, 0)
      ).to.be.revertedWithCustomError(marketplace, "PriceZero");
    });

    it("should reject update on inactive listing", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);
      await marketplace.connect(alice).cancelListing(0);
      await expect(
        marketplace.connect(alice).updateListingPrice(0, ethers.parseEther("2"))
      ).to.be.revertedWithCustomError(marketplace, "ListingNotActive");
    });
  });

  // ── Cancel Auction ──────────────────────────────────────────────

  describe("Cancel Auction", () => {
    const START_PRICE = ethers.parseEther("0.5");
    const DURATION = 3600;

    it("should allow seller to cancel auction with no bids", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await expect(marketplace.connect(alice).cancelAuction(0))
        .to.emit(marketplace, "AuctionCancelled")
        .withArgs(0);

      // NFT returned to seller
      expect(await nft.ownerOf(0)).to.equal(alice.address);
    });

    it("should reject cancel from non-seller", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );

      await expect(
        marketplace.connect(bob).cancelAuction(0)
      ).to.be.revertedWithCustomError(marketplace, "NotTheSeller");
    });

    it("should reject cancel when bids exist", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 0, START_PRICE, DURATION
      );
      await marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.6") });

      await expect(
        marketplace.connect(alice).cancelAuction(0)
      ).to.be.revertedWithCustomError(marketplace, "AuctionHasBids");
    });
  });

  // ── Withdraw Event ──────────────────────────────────────────────

  describe("Withdraw Event", () => {
    it("should emit Withdrawn event on withdrawal", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 0, PRICE, 0);
      await marketplace.connect(bob).buyNFT(0, { value: PRICE });

      await expect(marketplace.connect(owner).withdraw())
        .to.emit(marketplace, "Withdrawn")
        .withArgs(owner.address, ethers.parseEther("0.025"));
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
      ).to.be.revertedWithCustomError(marketplace, "FeeTooHigh");
    });

    it("should reject non-owner setting fee", async () => {
      await expect(
        marketplace.connect(alice).setPlatformFee(100)
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });
  });
});
