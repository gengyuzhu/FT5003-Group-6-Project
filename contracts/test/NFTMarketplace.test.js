const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NFTMarketplace", function () {
  let nft, marketplace, oracle, owner, alice, bob, charlie;

  const ORACLE_PRICE = 209100000000n; // $2091.00 with 8 decimals
  const PRICE_USD = 209100n;          // $2091.00 in cents = exactly 1 ETH at this oracle rate
  const ROYALTY_FEE = 500;            // 5%

  /**
   * Compute expected wei from a USD-cents price and an oracle price.
   * Formula mirrors _getRequiredWei in the contract (rounds up):
   *   requiredWei = (priceUsdCents * 1e24 + oraclePrice - 1) / oraclePrice
   */
  function expectedWei(priceUsdCents, oraclePrice = ORACLE_PRICE) {
    return (BigInt(priceUsdCents) * 10n ** 24n + BigInt(oraclePrice) - 1n) / BigInt(oraclePrice);
  }

  /**
   * Submit a fresh oracle round (3 reporters submit the same price → median = price).
   * Can be called multiple times; each call finalizes a new round.
   */
  async function seedOraclePrice(price = ORACLE_PRICE) {
    await oracle.connect(owner).submitPrice(price);
    await oracle.connect(alice).submitPrice(price);
    await oracle.connect(bob).submitPrice(price);
  }

  beforeEach(async () => {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    nft = await NFTCollection.deploy();

    const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    marketplace = await NFTMarketplace.deploy();

    // Deploy and configure oracle
    const SimpleOracle = await ethers.getContractFactory("SimpleOracle");
    oracle = await SimpleOracle.deploy();

    // Add 3 reporters (MIN_REPORTERS = 3)
    await oracle.addReporter(owner.address);
    await oracle.addReporter(alice.address);
    await oracle.addReporter(bob.address);

    // Seed initial price: $2091.00 → PRICE_USD ($2091.00 in cents) = exactly 1 ETH
    await seedOraclePrice();

    // Link oracle to marketplace
    await marketplace.setOracle(await oracle.getAddress());

    // Alice mints token 1 with 5% royalty
    await nft.connect(alice).mintNFT(alice.address, "ipfs://test", ROYALTY_FEE);
    // Approve marketplace
    await nft.connect(alice).approve(await marketplace.getAddress(), 1);
  });

  // ── Fixed-price listings ─────────────────────────────────────────

  describe("Fixed-price listings", () => {
    it("should list an NFT for USD price (no expiry)", async () => {
      await expect(
        marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0)
      )
        .to.emit(marketplace, "Listed")
        .withArgs(0, alice.address, await nft.getAddress(), 1, PRICE_USD, 0);

      const listing = await marketplace.listings(0);
      expect(listing.seller).to.equal(alice.address);
      expect(listing.priceUsdCents).to.equal(PRICE_USD);
      expect(listing.active).to.be.true;
      expect(listing.expiration).to.equal(0);
    });

    it("should list an NFT with expiration", async () => {
      const duration = 86400; // 1 day
      const tx = await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, duration);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const listing = await marketplace.listings(0);
      expect(listing.expiration).to.equal(block.timestamp + duration);
    });

    it("should reject listing without approval", async () => {
      await nft.connect(bob).mintNFT(bob.address, "ipfs://bob", 0);
      await expect(
        marketplace.connect(bob).listNFT(await nft.getAddress(), 2, PRICE_USD, 0)
      ).to.be.revertedWithCustomError(marketplace, "MarketplaceNotApproved");
    });

    it("should reject listing with zero price", async () => {
      await expect(
        marketplace.connect(alice).listNFT(await nft.getAddress(), 1, 0, 0)
      ).to.be.revertedWithCustomError(marketplace, "PriceZero");
    });

    it("should allow buying a listed NFT (pull-payment)", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      const requiredEth = expectedWei(PRICE_USD); // exactly 1 ETH

      await expect(
        marketplace.connect(bob).buyNFT(0, { value: requiredEth })
      )
        .to.emit(marketplace, "Sold")
        .withArgs(0, bob.address, requiredEth);

      // Bob now owns the NFT
      expect(await nft.ownerOf(1)).to.equal(bob.address);

      // Funds are in pendingWithdrawals (pull-payment)
      // Platform fee: 2.5% of 1 ETH = 0.025 ETH -> owner
      const ownerPending = await marketplace.pendingWithdrawals(owner.address);
      expect(ownerPending).to.equal(ethers.parseEther("0.025"));

      // Royalty: 5% of 1 ETH = 0.05 ETH -> alice (creator)
      // Seller proceeds: 1 - 0.025 - 0.05 = 0.925 ETH -> alice (seller = creator)
      // Total for alice: 0.05 + 0.925 = 0.975 ETH
      const alicePending = await marketplace.pendingWithdrawals(alice.address);
      expect(alicePending).to.equal(ethers.parseEther("0.975"));
    });

    it("should allow withdrawing accumulated funds", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      const requiredEth = expectedWei(PRICE_USD);
      await marketplace.connect(bob).buyNFT(0, { value: requiredEth });

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

    it("should reject insufficient payment", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWithCustomError(marketplace, "InsufficientPayment");
    });

    it("should reject seller buying own NFT", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      const requiredEth = expectedWei(PRICE_USD);
      await expect(
        marketplace.connect(alice).buyNFT(0, { value: requiredEth })
      ).to.be.revertedWithCustomError(marketplace, "SellerCannotBuy");
    });

    it("should allow cancelling a listing", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      await expect(marketplace.connect(alice).cancelListing(0))
        .to.emit(marketplace, "ListingCancelled")
        .withArgs(0);

      const listing = await marketplace.listings(0);
      expect(listing.active).to.be.false;
    });

    it("should reject cancel from non-seller", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      await expect(
        marketplace.connect(bob).cancelListing(0)
      ).to.be.revertedWithCustomError(marketplace, "NotTheSeller");
    });
  });

  // ── Listing Expiration ─────────────────────────────────────────

  describe("Listing Expiration", () => {
    it("listing with expiration=0 never expires", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      // Fast-forward 30 days
      await time.increase(30 * 86400);

      // Refresh oracle price (would be stale after 30 days)
      await seedOraclePrice();

      const requiredEth = expectedWei(PRICE_USD);
      // Should still be buyable
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: requiredEth })
      ).to.emit(marketplace, "Sold");
    });

    it("listing with future expiration is buyable", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 86400); // 1 day

      const requiredEth = expectedWei(PRICE_USD);
      // Buy before expiry
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: requiredEth })
      ).to.emit(marketplace, "Sold");
    });

    it("listing with past expiration reverts on buyNFT", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 3600); // 1 hour

      // Fast-forward past expiry
      await time.increase(3601);

      // Expiration check triggers before oracle call, so no StalePrice issue
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "ListingExpiredError");
    });

    it("isListingExpired returns correct value", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 3600);

      expect(await marketplace.isListingExpired(0)).to.be.false;

      await time.increase(3601);

      expect(await marketplace.isListingExpired(0)).to.be.true;
    });
  });

  // ── Auctions (ETH-denominated, no oracle changes) ────────────────

  describe("Auctions", () => {
    const START_PRICE = ethers.parseEther("0.5");
    const DURATION = 3600; // 1 hour

    it("should create an auction", async () => {
      await expect(
        marketplace.connect(alice).createAuction(
          await nft.getAddress(), 1, START_PRICE, DURATION
        )
      ).to.emit(marketplace, "AuctionCreated");

      // NFT is escrowed in marketplace
      expect(await nft.ownerOf(1)).to.equal(await marketplace.getAddress());
    });

    it("should accept bids", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
      );

      await expect(
        marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.6") })
      )
        .to.emit(marketplace, "BidPlaced")
        .withArgs(0, bob.address, ethers.parseEther("0.6"));
    });

    it("should reject bid below start price", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
      );

      await expect(
        marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.1") })
      ).to.be.revertedWithCustomError(marketplace, "BidBelowStartPrice");
    });

    it("should reject bid without minimum 5% increment", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
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
        await nft.getAddress(), 1, START_PRICE, DURATION
      );
      await marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("0.6") });

      // 5% of 0.6 = 0.03, minimum next bid = 0.63 ETH
      await expect(
        marketplace.connect(charlie).placeBid(0, { value: ethers.parseEther("0.63") })
      ).to.emit(marketplace, "BidPlaced");
    });

    it("should refund outbid bidder via pendingWithdrawals", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
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
        await nft.getAddress(), 1, START_PRICE, DURATION
      );

      await marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("1") });

      // Fast-forward past auction end
      await time.increase(DURATION + 1);

      await expect(marketplace.endAuction(0))
        .to.emit(marketplace, "AuctionEnded")
        .withArgs(0, bob.address, ethers.parseEther("1"));

      expect(await nft.ownerOf(1)).to.equal(bob.address);

      // Check funds accumulated in pendingWithdrawals
      // Platform fee: 2.5% of 1 ETH = 0.025 ETH
      expect(await marketplace.pendingWithdrawals(owner.address)).to.equal(ethers.parseEther("0.025"));
      // Alice gets royalty (5% = 0.05) + seller proceeds (0.925) = 0.975 ETH
      expect(await marketplace.pendingWithdrawals(alice.address)).to.equal(ethers.parseEther("0.975"));
    });

    it("should return NFT to seller if no bids", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
      );

      await time.increase(DURATION + 1);
      await marketplace.endAuction(0);

      expect(await nft.ownerOf(1)).to.equal(alice.address);
    });

    it("should reject ending auction before expiry", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
      );

      await expect(marketplace.endAuction(0))
        .to.be.revertedWithCustomError(marketplace, "AuctionNotExpired");
    });

    it("should reject seller bidding on own auction", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
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
        marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0)
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");

      await marketplace.connect(owner).unpause();
      // Should work again after unpause
      await expect(
        marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0)
      ).to.emit(marketplace, "Listed");
    });

    it("paused marketplace rejects all mutating operations", async () => {
      // First create a listing and auction before pausing
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      // Mint another token for auction test
      await nft.connect(bob).mintNFT(bob.address, "ipfs://bob", 0);
      await nft.connect(bob).approve(await marketplace.getAddress(), 2);

      await marketplace.connect(owner).pause();

      // All these should revert with EnforcedPause (before any oracle call)
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");

      await expect(
        marketplace.connect(alice).cancelListing(0)
      ).to.be.revertedWithCustomError(marketplace, "EnforcedPause");

      await expect(
        marketplace.connect(bob).createAuction(await nft.getAddress(), 2, ethers.parseEther("1"), 3600)
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
      // Alice mints token 2 with 5% royalty (alice is creator/royalty receiver)
      await nft.connect(alice).mintNFT(alice.address, "ipfs://test2", ROYALTY_FEE);
      // Transfer token 2 to bob (bob becomes seller, alice stays royalty receiver)
      await nft.connect(alice).transferFrom(alice.address, bob.address, 2);
      await nft.connect(bob).approve(await marketplace.getAddress(), 2);

      // Bob lists token 2 for $2091.00 (= 1 ETH at oracle rate)
      await marketplace.connect(bob).listNFT(await nft.getAddress(), 2, PRICE_USD, 0);

      // Charlie buys
      const requiredEth = expectedWei(PRICE_USD);
      await marketplace.connect(charlie).buyNFT(0, { value: requiredEth });

      // Platform fee: 2.5% = 0.025 ETH -> owner
      expect(await marketplace.pendingWithdrawals(owner.address)).to.equal(ethers.parseEther("0.025"));
      // Royalty: 5% = 0.05 ETH -> alice (creator)
      expect(await marketplace.pendingWithdrawals(alice.address)).to.equal(ethers.parseEther("0.05"));
      // Seller proceeds: 1 - 0.025 - 0.05 = 0.925 ETH -> bob (seller)
      expect(await marketplace.pendingWithdrawals(bob.address)).to.equal(ethers.parseEther("0.925"));
    });
  });

  // ── Update Listing Price ─────────────────────────────────────────

  describe("Update Listing Price", () => {
    it("should allow seller to update listing price (USD)", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      const newPriceUsd = 500000n; // $5000.00

      await expect(marketplace.connect(alice).updateListingPrice(0, newPriceUsd))
        .to.emit(marketplace, "ListingPriceUpdated")
        .withArgs(0, PRICE_USD, newPriceUsd);

      const listing = await marketplace.listings(0);
      expect(listing.priceUsdCents).to.equal(newPriceUsd);
    });

    it("should reject update from non-seller", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      await expect(
        marketplace.connect(bob).updateListingPrice(0, 500000n)
      ).to.be.revertedWithCustomError(marketplace, "NotTheSeller");
    });

    it("should reject update to zero price", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      await expect(
        marketplace.connect(alice).updateListingPrice(0, 0)
      ).to.be.revertedWithCustomError(marketplace, "PriceZero");
    });

    it("should reject update on inactive listing", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      await marketplace.connect(alice).cancelListing(0);
      await expect(
        marketplace.connect(alice).updateListingPrice(0, 500000n)
      ).to.be.revertedWithCustomError(marketplace, "ListingNotActive");
    });
  });

  // ── Cancel Auction ──────────────────────────────────────────────

  describe("Cancel Auction", () => {
    const START_PRICE = ethers.parseEther("0.5");
    const DURATION = 3600;

    it("should allow seller to cancel auction with no bids", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
      );

      await expect(marketplace.connect(alice).cancelAuction(0))
        .to.emit(marketplace, "AuctionCancelled")
        .withArgs(0);

      // NFT returned to seller
      expect(await nft.ownerOf(1)).to.equal(alice.address);
    });

    it("should reject cancel from non-seller", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
      );

      await expect(
        marketplace.connect(bob).cancelAuction(0)
      ).to.be.revertedWithCustomError(marketplace, "NotTheSeller");
    });

    it("should reject cancel when bids exist", async () => {
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, DURATION
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
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      const requiredEth = expectedWei(PRICE_USD);
      await marketplace.connect(bob).buyNFT(0, { value: requiredEth });

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

  // ── Oracle Integration ─────────────────────────────────────────

  describe("Oracle Integration", () => {
    it("should revert buyNFT when oracle is not set", async () => {
      // Deploy a fresh marketplace without oracle linked
      const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
      const mkt2 = await NFTMarketplace.deploy();

      // Alice approves and lists on the oracle-less marketplace
      await nft.connect(alice).approve(await mkt2.getAddress(), 1);
      await mkt2.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      await expect(
        mkt2.connect(bob).buyNFT(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(mkt2, "OracleNotSet");
    });

    it("should revert when oracle price is stale", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      // Advance time past oracle staleness threshold (1 hour)
      await time.increase(3601);

      await expect(
        marketplace.connect(bob).buyNFT(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(oracle, "StalePrice");
    });

    it("should refund excess ETH to buyer via pendingWithdrawals", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      const requiredEth = expectedWei(PRICE_USD); // exactly 1 ETH
      // Send 1% extra (within 2% slippage tolerance)
      const extra = requiredEth / 100n;
      const sendAmount = requiredEth + extra;

      await marketplace.connect(bob).buyNFT(0, { value: sendAmount });

      // Bob should have excess in pendingWithdrawals
      const bobPending = await marketplace.pendingWithdrawals(bob.address);
      expect(bobPending).to.equal(extra);
    });

    it("should reject payment exceeding slippage tolerance", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      const requiredEth = expectedWei(PRICE_USD);
      // Send 3% extra (exceeds 2% slippage)
      const tooMuch = requiredEth + (requiredEth * 3n) / 100n;

      await expect(
        marketplace.connect(bob).buyNFT(0, { value: tooMuch })
      ).to.be.revertedWithCustomError(marketplace, "ExcessivePayment");
    });

    it("getListingPriceInWei returns correct values", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      const [requiredWei, maxWei] = await marketplace.getListingPriceInWei(0);
      const expected = expectedWei(PRICE_USD);

      expect(requiredWei).to.equal(expected);
      expect(maxWei).to.equal(expected + (expected * 200n) / 10000n);
    });

    it("should handle oracle price change between listing and buying", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);

      // Oracle price increases by ~25%: $2614 (within 50% deviation limit)
      const newOraclePrice = 261400000000n;
      await seedOraclePrice(newOraclePrice);

      const newRequiredEth = expectedWei(PRICE_USD, newOraclePrice);

      await expect(
        marketplace.connect(bob).buyNFT(0, { value: newRequiredEth })
      )
        .to.emit(marketplace, "Sold")
        .withArgs(0, bob.address, newRequiredEth);

      expect(await nft.ownerOf(1)).to.equal(bob.address);
    });
  });

  // ── Additional Test Coverage ─────────────────────────────────────

  describe("Additional Coverage", () => {
    const START_PRICE = ethers.parseEther("0.5");
    const DURATION = 3600;

    // -- Listing edge cases --
    it("should reject listing by non-owner of NFT", async () => {
      await expect(
        marketplace.connect(bob).listNFT(await nft.getAddress(), 1, PRICE_USD, 0)
      ).to.be.revertedWithCustomError(marketplace, "NotTokenOwner");
    });

    it("should reject buying a cancelled listing", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      await marketplace.connect(alice).cancelListing(0);
      await expect(
        marketplace.connect(bob).buyNFT(0, { value: expectedWei(PRICE_USD) })
      ).to.be.revertedWithCustomError(marketplace, "ListingNotActive");
    });

    it("should reject double-cancel of listing", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      await marketplace.connect(alice).cancelListing(0);
      await expect(
        marketplace.connect(alice).cancelListing(0)
      ).to.be.revertedWithCustomError(marketplace, "ListingNotActive");
    });

    // -- Auction edge cases --
    it("should reject auction with duration less than 1 hour", async () => {
      await expect(
        marketplace.connect(alice).createAuction(await nft.getAddress(), 1, START_PRICE, 1800)
      ).to.be.revertedWithCustomError(marketplace, "InvalidDuration");
    });

    it("should reject auction with duration greater than 7 days", async () => {
      await expect(
        marketplace.connect(alice).createAuction(await nft.getAddress(), 1, START_PRICE, 8 * 86400)
      ).to.be.revertedWithCustomError(marketplace, "InvalidDuration");
    });

    it("should reject auction with zero start price", async () => {
      await expect(
        marketplace.connect(alice).createAuction(await nft.getAddress(), 1, 0, DURATION)
      ).to.be.revertedWithCustomError(marketplace, "PriceZero");
    });

    it("should reject auction without approval", async () => {
      await nft.connect(bob).mintNFT(bob.address, "ipfs://bob-auction", 0);
      // bob does NOT approve marketplace
      await expect(
        marketplace.connect(bob).createAuction(await nft.getAddress(), 2, START_PRICE, DURATION)
      ).to.be.revertedWithCustomError(marketplace, "MarketplaceNotApproved");
    });

    it("should reject auction by non-owner", async () => {
      await expect(
        marketplace.connect(bob).createAuction(await nft.getAddress(), 1, START_PRICE, DURATION)
      ).to.be.revertedWithCustomError(marketplace, "NotTokenOwner");
    });

    it("should reject ending an already-ended auction", async () => {
      await marketplace.connect(alice).createAuction(await nft.getAddress(), 1, START_PRICE, DURATION);
      await time.increase(DURATION + 1);
      await marketplace.endAuction(0);
      await expect(marketplace.endAuction(0))
        .to.be.revertedWithCustomError(marketplace, "AuctionAlreadyEnded");
    });

    it("should reject bidding on an ended auction", async () => {
      await marketplace.connect(alice).createAuction(await nft.getAddress(), 1, START_PRICE, DURATION);
      await time.increase(DURATION + 1);
      await marketplace.endAuction(0);
      await expect(
        marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "AuctionAlreadyEnded");
    });

    it("should reject bidding after auction time expires", async () => {
      await marketplace.connect(alice).createAuction(await nft.getAddress(), 1, START_PRICE, DURATION);
      await time.increase(DURATION + 1);
      await expect(
        marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(marketplace, "AuctionExpired");
    });

    it("anyone can call endAuction", async () => {
      await marketplace.connect(alice).createAuction(await nft.getAddress(), 1, START_PRICE, DURATION);
      await marketplace.connect(bob).placeBid(0, { value: ethers.parseEther("1") });
      await time.increase(DURATION + 1);
      // Charlie (neither seller nor bidder) ends the auction
      await expect(marketplace.connect(charlie).endAuction(0))
        .to.emit(marketplace, "AuctionEnded");
    });

    it("cancelAuction works when contract is paused", async () => {
      await marketplace.connect(alice).createAuction(await nft.getAddress(), 1, START_PRICE, DURATION);
      await marketplace.connect(owner).pause();
      // Should succeed even when paused
      await expect(marketplace.connect(alice).cancelAuction(0))
        .to.emit(marketplace, "AuctionCancelled");
      expect(await nft.ownerOf(1)).to.equal(alice.address);
    });

    // -- Admin --
    it("should reject non-owner setting oracle", async () => {
      await expect(
        marketplace.connect(alice).setOracle(await oracle.getAddress())
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });

    it("should reject setting oracle to zero address", async () => {
      await expect(
        marketplace.connect(owner).setOracle(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(marketplace, "OracleNotSet");
    });

    it("setOracle emits OracleUpdated event", async () => {
      const newOracle = await oracle.getAddress();
      await expect(marketplace.connect(owner).setOracle(newOracle))
        .to.emit(marketplace, "OracleUpdated")
        .withArgs(newOracle);
    });

    it("setPlatformFee emits PlatformFeeUpdated event", async () => {
      await expect(marketplace.connect(owner).setPlatformFee(100))
        .to.emit(marketplace, "PlatformFeeUpdated")
        .withArgs(100);
    });

    it("setPlatformFee at exactly MAX_FEE (1000) succeeds", async () => {
      await marketplace.connect(owner).setPlatformFee(1000);
      expect(await marketplace.platformFeeBps()).to.equal(1000);
    });

    it("getListingCount and getAuctionCount return correct values", async () => {
      expect(await marketplace.getListingCount()).to.equal(0);
      expect(await marketplace.getAuctionCount()).to.equal(0);

      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      expect(await marketplace.getListingCount()).to.equal(1);

      // Mint token 2 for auction
      await nft.connect(bob).mintNFT(bob.address, "ipfs://bob2", 0);
      await nft.connect(bob).approve(await marketplace.getAddress(), 2);
      await marketplace.connect(bob).createAuction(await nft.getAddress(), 2, START_PRICE, DURATION);
      expect(await marketplace.getAuctionCount()).to.equal(1);
    });

    it("withdraw works when contract is paused", async () => {
      await marketplace.connect(alice).listNFT(await nft.getAddress(), 1, PRICE_USD, 0);
      await marketplace.connect(bob).buyNFT(0, { value: expectedWei(PRICE_USD) });
      await marketplace.connect(owner).pause();
      // Withdrawals should work while paused
      await expect(marketplace.connect(owner).withdraw())
        .to.emit(marketplace, "Withdrawn");
    });

    // -- Oracle edge cases --
    it("should revert when oracle price is zero", async () => {
      // Deploy fresh oracle with no deviation check issue by starting fresh
      const SimpleOracle2 = await ethers.getContractFactory("SimpleOracle");
      const oracle2 = await SimpleOracle2.deploy();
      await oracle2.addReporter(owner.address);
      await oracle2.addReporter(alice.address);
      await oracle2.addReporter(bob.address);
      // Submit price 0 (all reporters) - this will be the first round, no deviation check
      await oracle2.connect(owner).submitPrice(0);
      await oracle2.connect(alice).submitPrice(0);
      await oracle2.connect(bob).submitPrice(0);

      const NFTMarketplace2 = await ethers.getContractFactory("NFTMarketplace");
      const mkt2 = await NFTMarketplace2.deploy();
      await mkt2.setOracle(await oracle2.getAddress());

      await nft.connect(bob).mintNFT(bob.address, "ipfs://zero-test", 0);
      await nft.connect(bob).approve(await mkt2.getAddress(), 2);
      await mkt2.connect(bob).listNFT(await nft.getAddress(), 2, PRICE_USD, 0);

      await expect(
        mkt2.connect(charlie).buyNFT(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(mkt2, "OracleNotSet");
    });

    // -- SimpleOracle --
    it("oracle price deviation check rejects extreme prices", async () => {
      // Current price is $2091, try submitting $100 (>50% deviation)
      await expect(
        oracle.connect(owner).submitPrice(10000000000n) // $100
      ).to.be.revertedWithCustomError(oracle, "PriceDeviationTooHigh");
    });

    it("oracle hasSubmitted returns correct value", async () => {
      // Start a new round (seed another round)
      await seedOraclePrice();
      // In new round, nobody has submitted yet
      expect(await oracle.hasSubmitted(owner.address)).to.be.false;
      await oracle.connect(owner).submitPrice(ORACLE_PRICE);
      expect(await oracle.hasSubmitted(owner.address)).to.be.true;
    });

    it("oracle forceAdvanceRound resets round", async () => {
      // Submit one price (not enough to finalize)
      await oracle.connect(owner).submitPrice(ORACLE_PRICE);
      expect(await oracle.getCurrentRoundSubmissions()).to.equal(1);

      // Force advance
      await oracle.connect(owner).forceAdvanceRound();
      expect(await oracle.getCurrentRoundSubmissions()).to.equal(0);
    });

    it("oracle forceAdvanceRound restricted to owner", async () => {
      await expect(
        oracle.connect(alice).forceAdvanceRound()
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });
  });

  // ── Batch Listing ─────────────────────────────────────────────────────

  describe("Batch Listing", () => {
    beforeEach(async () => {
      // Mint 3 NFTs for alice
      await nft.connect(alice).mintNFT(alice.address, "ipfs://b1", ROYALTY_FEE);
      await nft.connect(alice).mintNFT(alice.address, "ipfs://b2", ROYALTY_FEE);
      await nft.connect(alice).mintNFT(alice.address, "ipfs://b3", ROYALTY_FEE);
      // Approve marketplace for all
      await nft.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
    });

    it("should batch list multiple NFTs in one transaction", async () => {
      const tokenIds = [1, 2, 3];
      const prices = [PRICE_USD, PRICE_USD * 2n, PRICE_USD * 3n];
      const durations = [0, 3600, 7200];

      const tx = await marketplace.connect(alice).batchListNFT(
        await nft.getAddress(), tokenIds, prices, durations
      );

      await expect(tx).to.emit(marketplace, "BatchListed");
      await expect(tx).to.emit(marketplace, "Listed");

      expect(await marketplace.getListingCount()).to.equal(3);

      // Verify each listing
      const l0 = await marketplace.listings(0);
      expect(l0.seller).to.equal(alice.address);
      expect(l0.priceUsdCents).to.equal(PRICE_USD);
      expect(l0.active).to.be.true;

      const l2 = await marketplace.listings(2);
      expect(l2.priceUsdCents).to.equal(PRICE_USD * 3n);
    });

    it("should revert on array length mismatch", async () => {
      await expect(
        marketplace.connect(alice).batchListNFT(
          await nft.getAddress(), [1, 2], [PRICE_USD], [0, 0]
        )
      ).to.be.revertedWithCustomError(marketplace, "ArrayLengthMismatch");
    });

    it("should revert if batch exceeds MAX_BATCH_SIZE", async () => {
      // Create arrays of size 21 (MAX_BATCH_SIZE = 20)
      const tokenIds = Array.from({ length: 21 }, (_, i) => i + 1);
      const prices = Array(21).fill(PRICE_USD);
      const durations = Array(21).fill(0);

      await expect(
        marketplace.connect(alice).batchListNFT(
          await nft.getAddress(), tokenIds, prices, durations
        )
      ).to.be.revertedWithCustomError(marketplace, "BatchTooLarge");
    });

    it("should revert if any price is zero", async () => {
      await expect(
        marketplace.connect(alice).batchListNFT(
          await nft.getAddress(), [1, 2], [PRICE_USD, 0n], [0, 0]
        )
      ).to.be.revertedWithCustomError(marketplace, "PriceZero");
    });

    it("should allow buying batch-listed NFTs individually", async () => {
      await marketplace.connect(alice).batchListNFT(
        await nft.getAddress(), [1, 2], [PRICE_USD, PRICE_USD], [0, 0]
      );

      const wei = expectedWei(PRICE_USD);
      await marketplace.connect(charlie).buyNFT(0, { value: wei });
      expect(await nft.ownerOf(1)).to.equal(charlie.address);

      // Second listing still active
      const l1 = await marketplace.listings(1);
      expect(l1.active).to.be.true;
    });
  });

  // ── Anti-Snipe Auction Extension ────────────────────────────────────

  describe("Anti-Snipe Auction Extension", () => {
    const START_PRICE = ethers.parseEther("1");
    const AUCTION_DURATION = 3600; // 1 hour

    beforeEach(async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://snipe", ROYALTY_FEE);
      await nft.connect(alice).approve(await marketplace.getAddress(), 1);
      await marketplace.connect(alice).createAuction(
        await nft.getAddress(), 1, START_PRICE, AUCTION_DURATION
      );
    });

    it("should NOT extend auction when bid is placed early", async () => {
      const auctionBefore = await marketplace.auctions(0);
      const originalEndTime = auctionBefore.endTime;

      // Bid early (not in last 5 minutes)
      await marketplace.connect(bob).placeBid(0, { value: START_PRICE });

      const auctionAfter = await marketplace.auctions(0);
      // End time should NOT be extended (bid placed with > 5 min remaining)
      expect(auctionAfter.endTime).to.equal(originalEndTime);
    });

    it("should extend auction by 5 minutes when bid in last 5 minutes", async () => {
      // Fast forward to 4 minutes before auction ends (within ANTI_SNIPE_DURATION)
      await time.increase(AUCTION_DURATION - 4 * 60);

      const tx = await marketplace.connect(bob).placeBid(0, { value: START_PRICE });

      await expect(tx).to.emit(marketplace, "AuctionExtended");

      const auction = await marketplace.auctions(0);
      const blockTime = await time.latest();
      // New end time should be blockTime + 5 minutes
      expect(auction.endTime).to.equal(blockTime + 5 * 60);
    });

    it("should extend multiple times for multiple snipe bids", async () => {
      // Go to 2 minutes before end
      await time.increase(AUCTION_DURATION - 2 * 60);

      await marketplace.connect(bob).placeBid(0, { value: START_PRICE });
      const firstExtension = (await marketplace.auctions(0)).endTime;

      // Go to 1 minute before new end
      await time.increase(4 * 60);

      const minBid = START_PRICE + (START_PRICE * 500n) / 10000n; // 5% increment
      await marketplace.connect(charlie).placeBid(0, { value: minBid });
      const secondExtension = (await marketplace.auctions(0)).endTime;

      expect(secondExtension).to.be.gt(firstExtension);
    });

    it("should still allow ending auction after anti-snipe extension", async () => {
      await time.increase(AUCTION_DURATION - 2 * 60);
      await marketplace.connect(bob).placeBid(0, { value: START_PRICE });

      // Fast forward past the extended end time
      await time.increase(6 * 60);

      await marketplace.connect(owner).endAuction(0);
      expect(await nft.ownerOf(1)).to.equal(bob.address);
    });
  });

  // ── Oracle Price History ────────────────────────────────────────────

  describe("Oracle Price History", () => {
    it("should store price in history after finalization", async () => {
      // The beforeEach already finalized one round
      const history = await oracle.getPriceHistory();
      expect(history.length).to.equal(1);
      expect(history[0].price).to.equal(ORACLE_PRICE);
    });

    it("should accumulate history across multiple rounds", async () => {
      // Second round
      await seedOraclePrice(ORACLE_PRICE + 100000000n); // +$1

      const history = await oracle.getPriceHistory();
      expect(history.length).to.equal(2);
      expect(history[1].price).to.equal(ORACLE_PRICE + 100000000n);
    });

    it("should cap history at MAX_HISTORY (10) entries", async () => {
      // Already have 1 round from beforeEach, add 10 more
      for (let i = 0; i < 10; i++) {
        const price = ORACLE_PRICE + BigInt(i + 1) * 100000000n;
        await seedOraclePrice(price);
      }

      const historyLen = await oracle.getPriceHistoryLength();
      expect(historyLen).to.equal(10);
    });

    it("getPriceHistory returns all entries", async () => {
      await seedOraclePrice(ORACLE_PRICE + 100000000n);
      await seedOraclePrice(ORACLE_PRICE + 200000000n);

      const history = await oracle.getPriceHistory();
      expect(history.length).to.equal(3);
      // First entry is from beforeEach
      expect(history[0].price).to.equal(ORACLE_PRICE);
      expect(history[2].price).to.equal(ORACLE_PRICE + 200000000n);
    });
  });

  // ── Dutch Auction ────────────────────────────────────────────────────

  describe("Dutch Auction", () => {
    const START_PRICE_USD = PRICE_USD * 2n;  // $4182.00 in cents
    const END_PRICE_USD = PRICE_USD;          // $2091.00 in cents
    const DURATION = 3600;                    // 1 hour

    beforeEach(async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://dutch1", ROYALTY_FEE);
      await nft.connect(alice).approve(await marketplace.getAddress(), 1);
    });

    it("should create a Dutch auction with declining price", async () => {
      const tx = await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );
      await expect(tx).to.emit(marketplace, "DutchAuctionCreated");

      const da = await marketplace.dutchAuctions(0);
      expect(da.seller).to.equal(alice.address);
      expect(da.startPriceUsdCents).to.equal(START_PRICE_USD);
      expect(da.endPriceUsdCents).to.equal(END_PRICE_USD);
      expect(da.sold).to.be.false;

      // NFT escrowed in marketplace
      expect(await nft.ownerOf(1)).to.equal(await marketplace.getAddress());
    });

    it("price should decline linearly over time", async () => {
      await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );

      // At start: price = START_PRICE_USD
      const priceStart = await marketplace.getDutchAuctionCurrentPrice(0);
      expect(priceStart).to.equal(START_PRICE_USD);

      // At halfway: price = (START + END) / 2
      await time.increase(DURATION / 2);
      const priceMid = await marketplace.getDutchAuctionCurrentPrice(0);
      const expectedMid = (START_PRICE_USD + END_PRICE_USD) / 2n;
      // Allow 1 cent rounding tolerance
      expect(priceMid).to.be.closeTo(expectedMid, 1n);

      // At end: price = END_PRICE_USD
      await time.increase(DURATION / 2 + 1);
      const priceEnd = await marketplace.getDutchAuctionCurrentPrice(0);
      expect(priceEnd).to.equal(END_PRICE_USD);
    });

    it("should allow buying at current declining price", async () => {
      await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );

      // Buy at halfway price — use getDutchAuctionPriceInWei for live price
      await time.increase(DURATION / 2);
      const [, maxWei] = await marketplace.getDutchAuctionPriceInWei(0);

      const tx = await marketplace.connect(bob).buyDutchAuction(0, { value: maxWei });
      await expect(tx).to.emit(marketplace, "DutchAuctionSold");

      expect(await nft.ownerOf(1)).to.equal(bob.address);
      expect((await marketplace.dutchAuctions(0)).sold).to.be.true;
    });

    it("should reject endPrice >= startPrice", async () => {
      await expect(
        marketplace.connect(alice).createDutchAuction(
          await nft.getAddress(), 1, PRICE_USD, PRICE_USD, DURATION
        )
      ).to.be.revertedWithCustomError(marketplace, "EndPriceTooHigh");
    });

    it("should reject seller buying own Dutch auction", async () => {
      await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );
      await expect(
        marketplace.connect(alice).buyDutchAuction(0, { value: ethers.parseEther("10") })
      ).to.be.revertedWithCustomError(marketplace, "SellerCannotBuy");
    });

    it("should reject insufficient payment", async () => {
      await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );
      await expect(
        marketplace.connect(bob).buyDutchAuction(0, { value: 1n })
      ).to.be.revertedWithCustomError(marketplace, "InsufficientPayment");
    });

    it("should allow seller to cancel unsold Dutch auction", async () => {
      await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );
      await marketplace.connect(alice).cancelDutchAuction(0);

      expect(await nft.ownerOf(1)).to.equal(alice.address);
      expect((await marketplace.dutchAuctions(0)).sold).to.be.true;
    });

    it("should reject cancel from non-seller", async () => {
      await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );
      await expect(
        marketplace.connect(bob).cancelDutchAuction(0)
      ).to.be.revertedWithCustomError(marketplace, "NotTheSeller");
    });

    it("should reject buying already-sold Dutch auction", async () => {
      await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );

      // Use live price to avoid slippage mismatch
      const [, maxWei] = await marketplace.getDutchAuctionPriceInWei(0);
      await marketplace.connect(bob).buyDutchAuction(0, { value: maxWei });

      await expect(
        marketplace.connect(charlie).buyDutchAuction(0, { value: maxWei })
      ).to.be.revertedWithCustomError(marketplace, "DutchAuctionEnded");
    });

    it("getDutchAuctionPriceInWei returns correct values", async () => {
      await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );

      const [requiredWei, maxWei] = await marketplace.getDutchAuctionPriceInWei(0);
      const expected = expectedWei(START_PRICE_USD);
      expect(requiredWei).to.equal(expected);
      expect(maxWei).to.equal(expected + (expected * 200n) / 10000n);
    });

    it("getDutchAuctionCount returns correct value", async () => {
      expect(await marketplace.getDutchAuctionCount()).to.equal(0);
      await marketplace.connect(alice).createDutchAuction(
        await nft.getAddress(), 1, START_PRICE_USD, END_PRICE_USD, DURATION
      );
      expect(await marketplace.getDutchAuctionCount()).to.equal(1);
    });
  });

  // ── On-Chain Offer System ─────────────────────────────────────────────

  describe("On-Chain Offers", () => {
    const OFFER_AMOUNT = ethers.parseEther("1");
    const OFFER_DURATION = 3600; // 1 hour

    beforeEach(async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://offer1", ROYALTY_FEE);
      await nft.connect(alice).approve(await marketplace.getAddress(), 1);
    });

    it("should allow making an offer with ETH escrow", async () => {
      const tx = await marketplace.connect(bob).makeOffer(
        await nft.getAddress(), 1, OFFER_DURATION, { value: OFFER_AMOUNT }
      );
      await expect(tx).to.emit(marketplace, "OfferMade");

      const offer = await marketplace.offers(0);
      expect(offer.buyer).to.equal(bob.address);
      expect(offer.amount).to.equal(OFFER_AMOUNT);
      expect(offer.active).to.be.true;

      expect(await marketplace.getOfferCount()).to.equal(1);
    });

    it("should allow NFT owner to accept an offer", async () => {
      await marketplace.connect(bob).makeOffer(
        await nft.getAddress(), 1, OFFER_DURATION, { value: OFFER_AMOUNT }
      );

      const tx = await marketplace.connect(alice).acceptOffer(0);
      await expect(tx).to.emit(marketplace, "OfferAccepted");

      // NFT transferred to buyer
      expect(await nft.ownerOf(1)).to.equal(bob.address);

      // Funds distributed via pull-payment
      const aliceBalance = await marketplace.pendingWithdrawals(alice.address);
      expect(aliceBalance).to.be.gt(0);

      // Offer deactivated
      expect((await marketplace.offers(0)).active).to.be.false;
    });

    it("should reject offer with zero ETH", async () => {
      await expect(
        marketplace.connect(bob).makeOffer(await nft.getAddress(), 1, OFFER_DURATION, { value: 0 })
      ).to.be.revertedWithCustomError(marketplace, "PriceZero");
    });

    it("should reject accept from non-owner", async () => {
      await marketplace.connect(bob).makeOffer(
        await nft.getAddress(), 1, OFFER_DURATION, { value: OFFER_AMOUNT }
      );
      await expect(
        marketplace.connect(charlie).acceptOffer(0)
      ).to.be.revertedWithCustomError(marketplace, "NotTokenOwner");
    });

    it("should reject accepting expired offer", async () => {
      await marketplace.connect(bob).makeOffer(
        await nft.getAddress(), 1, OFFER_DURATION, { value: OFFER_AMOUNT }
      );
      await time.increase(OFFER_DURATION + 1);
      await expect(
        marketplace.connect(alice).acceptOffer(0)
      ).to.be.revertedWithCustomError(marketplace, "OfferExpired");
    });

    it("should allow buyer to cancel offer and reclaim ETH", async () => {
      await marketplace.connect(bob).makeOffer(
        await nft.getAddress(), 1, OFFER_DURATION, { value: OFFER_AMOUNT }
      );
      await marketplace.connect(bob).cancelOffer(0);

      expect((await marketplace.offers(0)).active).to.be.false;
      expect(await marketplace.pendingWithdrawals(bob.address)).to.equal(OFFER_AMOUNT);
    });

    it("should reject cancel from non-buyer", async () => {
      await marketplace.connect(bob).makeOffer(
        await nft.getAddress(), 1, OFFER_DURATION, { value: OFFER_AMOUNT }
      );
      await expect(
        marketplace.connect(alice).cancelOffer(0)
      ).to.be.revertedWithCustomError(marketplace, "NotTheSeller");
    });

    it("should allow multiple offers on the same NFT", async () => {
      await marketplace.connect(bob).makeOffer(
        await nft.getAddress(), 1, OFFER_DURATION, { value: OFFER_AMOUNT }
      );
      await marketplace.connect(charlie).makeOffer(
        await nft.getAddress(), 1, OFFER_DURATION, { value: OFFER_AMOUNT * 2n }
      );
      expect(await marketplace.getOfferCount()).to.equal(2);

      // Owner accepts the higher offer
      await marketplace.connect(alice).acceptOffer(1);
      expect(await nft.ownerOf(1)).to.equal(charlie.address);
    });

    it("should distribute platform fee and royalty on accepted offer", async () => {
      await marketplace.connect(bob).makeOffer(
        await nft.getAddress(), 1, OFFER_DURATION, { value: OFFER_AMOUNT }
      );
      await marketplace.connect(alice).acceptOffer(0);

      // Platform fee = 2.5% of 1 ETH
      const platformFee = OFFER_AMOUNT * 250n / 10000n;
      expect(await marketplace.pendingWithdrawals(owner.address)).to.equal(platformFee);

      // Royalty = 5% of 1 ETH
      const royalty = OFFER_AMOUNT * 500n / 10000n;
      // Alice is both seller and royalty receiver (she minted it)
      // So alice gets: sellerProceeds + royalty
      const aliceTotal = await marketplace.pendingWithdrawals(alice.address);
      expect(aliceTotal).to.equal(OFFER_AMOUNT - platformFee);
    });
  });

  // ── Oracle: Emergency Price + Reporter Stats + Volatility ──────────

  describe("Oracle Advanced Features", () => {
    it("emergency price override sets price immediately", async () => {
      const emergencyPrice = 300000000000n; // $3000
      await oracle.connect(owner).emergencySetPrice(emergencyPrice);

      expect(await oracle.emergencyPriceActive()).to.be.true;
      const [price] = await oracle.getLatestPrice();
      expect(price).to.equal(emergencyPrice);
    });

    it("emergency price is cleared by normal round finalization", async () => {
      await oracle.connect(owner).emergencySetPrice(300000000000n);
      expect(await oracle.emergencyPriceActive()).to.be.true;

      // Normal round
      await seedOraclePrice(ORACLE_PRICE);
      expect(await oracle.emergencyPriceActive()).to.be.false;
    });

    it("emergency price rejects zero", async () => {
      await expect(
        oracle.connect(owner).emergencySetPrice(0)
      ).to.be.revertedWithCustomError(oracle, "NoPrice");
    });

    it("emergency price restricted to owner", async () => {
      await expect(
        oracle.connect(alice).emergencySetPrice(300000000000n)
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });

    it("reporter submission count tracks correctly", async () => {
      // owner, alice, bob each submitted once in beforeEach seedOraclePrice
      expect(await oracle.reporterSubmissions(owner.address)).to.equal(1);
      expect(await oracle.reporterSubmissions(alice.address)).to.equal(1);
      expect(await oracle.reporterSubmissions(bob.address)).to.equal(1);

      // Another round
      await seedOraclePrice(ORACLE_PRICE);
      expect(await oracle.reporterSubmissions(owner.address)).to.equal(2);
    });

    it("getVolatility returns 0 with fewer than 2 samples", async () => {
      // Deploy fresh oracle with only 1 round
      const Fresh = await ethers.getContractFactory("SimpleOracle");
      const fresh = await Fresh.deploy();
      const [vol, count] = await fresh.getVolatility();
      expect(vol).to.equal(0);
      expect(count).to.equal(0);
    });

    it("getVolatility calculates spread correctly", async () => {
      // Add another round with different price
      await seedOraclePrice(ORACLE_PRICE + 10000000000n); // +$100

      const [vol, count] = await oracle.getVolatility();
      expect(count).to.equal(2);
      // Spread = $100 / avg($2091, $2191) ≈ 4.67% ≈ 467 bps
      expect(vol).to.be.gt(0);
      expect(vol).to.be.lt(1000); // reasonable range
    });

    it("emergency price is stored in price history", async () => {
      const historyBefore = await oracle.getPriceHistoryLength();
      await oracle.connect(owner).emergencySetPrice(300000000000n);
      const historyAfter = await oracle.getPriceHistoryLength();
      expect(historyAfter).to.equal(historyBefore + 1n);
    });

    it("TWAP returns time-weighted average", async () => {
      // We have 1 round from beforeEach
      const [twap1, count1] = await oracle.getTWAP();
      expect(count1).to.equal(1);
      expect(twap1).to.equal(ORACLE_PRICE);

      // Add another round with higher price
      await time.increase(60); // 60 seconds later
      await seedOraclePrice(ORACLE_PRICE + 10000000000n); // +$100

      const [twap2, count2] = await oracle.getTWAP();
      expect(count2).to.equal(2);
      // TWAP should be between the two prices, closer to the one with more duration
      expect(twap2).to.be.gte(ORACLE_PRICE);
      expect(twap2).to.be.lte(ORACLE_PRICE + 10000000000n);
    });

    it("TWAP reverts with no price history", async () => {
      const Fresh = await ethers.getContractFactory("SimpleOracle");
      const fresh = await Fresh.deploy();
      await expect(fresh.getTWAP()).to.be.revertedWithCustomError(fresh, "NoPrice");
    });

    it("minRoundInterval prevents rapid round finalization", async () => {
      // Set 60-second minimum interval
      await oracle.connect(owner).setMinRoundInterval(60);

      // Try to finalize another round immediately — should revert
      await oracle.connect(owner).submitPrice(ORACLE_PRICE);
      await oracle.connect(alice).submitPrice(ORACLE_PRICE);
      await expect(
        oracle.connect(bob).submitPrice(ORACLE_PRICE)
      ).to.be.revertedWithCustomError(oracle, "RoundTooFrequent");
    });

    it("minRoundInterval allows finalization after cooldown", async () => {
      await oracle.connect(owner).setMinRoundInterval(60);

      // Wait for cooldown
      await time.increase(61);

      // Now finalization should succeed
      await seedOraclePrice(ORACLE_PRICE);
      const [price] = await oracle.getLatestPrice();
      expect(price).to.equal(ORACLE_PRICE);
    });

    it("setMinRoundInterval restricted to owner", async () => {
      await expect(
        oracle.connect(alice).setMinRoundInterval(60)
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });
  });

  // ── P2P NFT Swaps (Atomic Bartering) ──────────────────────────────

  describe("P2P NFT Swaps", () => {
    const SWAP_DURATION = 3600; // 1 hour
    let aliceTokenId, bobTokenId;

    beforeEach(async () => {
      // Mint fresh NFTs and capture their token IDs
      const aliceTx = await nft.connect(alice).mintNFT(alice.address, "ipfs://swap1", ROYALTY_FEE);
      const aliceReceipt = await aliceTx.wait();
      aliceTokenId = aliceReceipt.logs.find(l => l.fragment?.name === "NFTMinted")?.args[0] ?? 2n;

      const bobTx = await nft.connect(bob).mintNFT(bob.address, "ipfs://swap2", ROYALTY_FEE);
      const bobReceipt = await bobTx.wait();
      bobTokenId = bobReceipt.logs.find(l => l.fragment?.name === "NFTMinted")?.args[0] ?? 3n;

      // Approve marketplace for all tokens
      await nft.connect(alice).setApprovalForAll(await marketplace.getAddress(), true);
      await nft.connect(bob).setApprovalForAll(await marketplace.getAddress(), true);
    });

    it("should propose a pure NFT-for-NFT swap (no ETH)", async () => {
      const tx = await marketplace.connect(alice).proposeSwap(
        bob.address,
        await nft.getAddress(), aliceTokenId,
        await nft.getAddress(), bobTokenId,
        SWAP_DURATION
      );
      await expect(tx).to.emit(marketplace, "SwapProposed");

      // Alice's NFT is escrowed
      expect(await nft.ownerOf(aliceTokenId)).to.equal(await marketplace.getAddress());

      const swap = await marketplace.swaps(0);
      expect(swap.proposer).to.equal(alice.address);
      expect(swap.counterparty).to.equal(bob.address);
      expect(swap.ethTopUp).to.equal(0);
      expect(swap.active).to.be.true;
      expect(await marketplace.getSwapCount()).to.equal(1);
    });

    it("should propose a swap with ETH top-up (sweetener)", async () => {
      const topUp = ethers.parseEther("0.5");
      await marketplace.connect(alice).proposeSwap(
        bob.address,
        await nft.getAddress(), aliceTokenId,
        await nft.getAddress(), bobTokenId,
        SWAP_DURATION,
        { value: topUp }
      );

      const swap = await marketplace.swaps(0);
      expect(swap.ethTopUp).to.equal(topUp);
    });

    it("should execute atomic swap when counterparty accepts", async () => {
      await marketplace.connect(alice).proposeSwap(
        bob.address,
        await nft.getAddress(), aliceTokenId,
        await nft.getAddress(), bobTokenId,
        SWAP_DURATION
      );

      const tx = await marketplace.connect(bob).acceptSwap(0);
      await expect(tx).to.emit(marketplace, "SwapExecuted");

      // NFTs swapped atomically
      expect(await nft.ownerOf(aliceTokenId)).to.equal(bob.address);
      expect(await nft.ownerOf(bobTokenId)).to.equal(alice.address);
      expect((await marketplace.swaps(0)).active).to.be.false;
    });

    it("should distribute ETH top-up on swap acceptance", async () => {
      const topUp = ethers.parseEther("1");
      await marketplace.connect(alice).proposeSwap(
        bob.address,
        await nft.getAddress(), aliceTokenId,
        await nft.getAddress(), bobTokenId,
        SWAP_DURATION,
        { value: topUp }
      );

      await marketplace.connect(bob).acceptSwap(0);

      // Platform fee = 2.5% of 1 ETH
      const platformFee = topUp * 250n / 10000n;
      expect(await marketplace.pendingWithdrawals(owner.address)).to.equal(platformFee);

      // Bob gets the rest (as counterparty receiving ETH)
      const bobBalance = await marketplace.pendingWithdrawals(bob.address);
      expect(bobBalance).to.be.gt(0);
    });

    it("should reject accept from non-counterparty", async () => {
      await marketplace.connect(alice).proposeSwap(
        bob.address,
        await nft.getAddress(), aliceTokenId,
        await nft.getAddress(), bobTokenId,
        SWAP_DURATION
      );

      await expect(
        marketplace.connect(charlie).acceptSwap(0)
      ).to.be.revertedWithCustomError(marketplace, "NotCounterparty");
    });

    it("should reject accept after expiration", async () => {
      await marketplace.connect(alice).proposeSwap(
        bob.address,
        await nft.getAddress(), aliceTokenId,
        await nft.getAddress(), bobTokenId,
        SWAP_DURATION
      );

      await time.increase(SWAP_DURATION + 1);

      await expect(
        marketplace.connect(bob).acceptSwap(0)
      ).to.be.revertedWithCustomError(marketplace, "SwapExpired");
    });

    it("should allow proposer to cancel and reclaim NFT + ETH", async () => {
      const topUp = ethers.parseEther("0.5");
      await marketplace.connect(alice).proposeSwap(
        bob.address,
        await nft.getAddress(), aliceTokenId,
        await nft.getAddress(), bobTokenId,
        SWAP_DURATION,
        { value: topUp }
      );

      await marketplace.connect(alice).cancelSwap(0);

      // NFT returned
      expect(await nft.ownerOf(aliceTokenId)).to.equal(alice.address);
      // ETH refunded via pull-payment
      expect(await marketplace.pendingWithdrawals(alice.address)).to.equal(topUp);
      expect((await marketplace.swaps(0)).active).to.be.false;
    });

    it("should reject cancel from non-proposer", async () => {
      await marketplace.connect(alice).proposeSwap(
        bob.address,
        await nft.getAddress(), aliceTokenId,
        await nft.getAddress(), bobTokenId,
        SWAP_DURATION
      );

      await expect(
        marketplace.connect(bob).cancelSwap(0)
      ).to.be.revertedWithCustomError(marketplace, "NotTheSeller");
    });

    it("should reject accepting already-cancelled swap", async () => {
      await marketplace.connect(alice).proposeSwap(
        bob.address,
        await nft.getAddress(), aliceTokenId,
        await nft.getAddress(), bobTokenId,
        SWAP_DURATION
      );

      await marketplace.connect(alice).cancelSwap(0);

      await expect(
        marketplace.connect(bob).acceptSwap(0)
      ).to.be.revertedWithCustomError(marketplace, "SwapNotActive");
    });
  });
});
