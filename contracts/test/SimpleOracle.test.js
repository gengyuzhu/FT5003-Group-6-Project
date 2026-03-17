const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SimpleOracle", function () {
  let oracle, owner, reporter1, reporter2, reporter3, reporter4, unauthorized;

  const PRICE_2091 = 209100000000n; // $2091.00 with 8 decimals
  const PRICE_2090 = 209000000000n;
  const PRICE_2092 = 209200000000n;
  const PRICE_2100 = 210000000000n;
  const PRICE_2080 = 208000000000n;

  beforeEach(async () => {
    [owner, reporter1, reporter2, reporter3, reporter4, unauthorized] = await ethers.getSigners();

    const SimpleOracle = await ethers.getContractFactory("SimpleOracle");
    oracle = await SimpleOracle.deploy();

    // Add 3 reporters
    await oracle.addReporter(reporter1.address);
    await oracle.addReporter(reporter2.address);
    await oracle.addReporter(reporter3.address);
  });

  describe("Reporter Management", () => {
    it("owner can add reporters", async () => {
      await expect(oracle.addReporter(reporter4.address))
        .to.emit(oracle, "ReporterAdded")
        .withArgs(reporter4.address);

      expect(await oracle.authorizedReporters(reporter4.address)).to.be.true;
      expect(await oracle.reporterCount()).to.equal(4);
    });

    it("owner can remove reporters", async () => {
      await expect(oracle.removeReporter(reporter3.address))
        .to.emit(oracle, "ReporterRemoved")
        .withArgs(reporter3.address);

      expect(await oracle.authorizedReporters(reporter3.address)).to.be.false;
      expect(await oracle.reporterCount()).to.equal(2);
    });

    it("non-owner cannot add reporters", async () => {
      await expect(
        oracle.connect(reporter1).addReporter(reporter4.address)
      ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
    });

    it("adding same reporter twice does not double count", async () => {
      await oracle.addReporter(reporter1.address); // already added
      expect(await oracle.reporterCount()).to.equal(3); // still 3
    });
  });

  describe("Price Submission", () => {
    it("authorized reporter can submit price", async () => {
      await expect(oracle.connect(reporter1).submitPrice(PRICE_2091))
        .to.emit(oracle, "PriceSubmitted")
        .withArgs(0, reporter1.address, PRICE_2091);
    });

    it("unauthorized address cannot submit", async () => {
      await expect(
        oracle.connect(unauthorized).submitPrice(PRICE_2091)
      ).to.be.revertedWithCustomError(oracle, "NotAuthorizedReporter");
    });

    it("same reporter cannot submit twice in same round", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await expect(
        oracle.connect(reporter1).submitPrice(PRICE_2092)
      ).to.be.revertedWithCustomError(oracle, "AlreadySubmitted");
    });

    it("round does not finalize with fewer than MIN_REPORTERS", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await oracle.connect(reporter2).submitPrice(PRICE_2090);

      expect(await oracle.getCurrentRoundSubmissions()).to.equal(2);

      // No price yet
      await expect(oracle.getLatestPrice()).to.be.revertedWithCustomError(oracle, "NoPrice");
    });
  });

  describe("Round Finalization (Median)", () => {
    it("finalizes round when MIN_REPORTERS submit (3 reporters → median)", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2090); // $2090
      await oracle.connect(reporter2).submitPrice(PRICE_2092); // $2092
      await expect(oracle.connect(reporter3).submitPrice(PRICE_2091)) // $2091
        .to.emit(oracle, "PriceUpdated");

      const [price, timestamp] = await oracle.getLatestPrice();
      // Sorted: [2090, 2091, 2092] → median = 2091
      expect(price).to.equal(PRICE_2091);
      expect(timestamp).to.be.greaterThan(0);
    });

    it("median selects middle value from odd number of submissions", async () => {
      await oracle.addReporter(reporter4.address);

      await oracle.connect(reporter1).submitPrice(PRICE_2080); // $2080
      await oracle.connect(reporter2).submitPrice(PRICE_2100); // $2100
      await oracle.connect(reporter3).submitPrice(PRICE_2091); // $2091 ← median

      // Round finalized at 3 (MIN_REPORTERS), reporter4 is ignored
      const [price] = await oracle.getLatestPrice();
      expect(price).to.equal(PRICE_2091);
    });

    it("advances round ID after finalization", async () => {
      expect(await oracle.currentRoundId()).to.equal(0);

      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      expect(await oracle.currentRoundId()).to.equal(1);
      expect(await oracle.getCurrentRoundSubmissions()).to.equal(0);
    });

    it("reporters can submit in new round after finalization", async () => {
      // Round 0
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      // Round 1 — same reporters can submit again
      await expect(oracle.connect(reporter1).submitPrice(PRICE_2100))
        .to.emit(oracle, "PriceSubmitted")
        .withArgs(1, reporter1.address, PRICE_2100);
    });
  });

  describe("Staleness Check", () => {
    it("getLatestPrice reverts if no price submitted", async () => {
      await expect(oracle.getLatestPrice())
        .to.be.revertedWithCustomError(oracle, "NoPrice");
    });

    it("getLatestPrice reverts if price is stale (>1h)", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      // Fast-forward 1 hour + 1 second
      await time.increase(3601);

      await expect(oracle.getLatestPrice())
        .to.be.revertedWithCustomError(oracle, "StalePrice");
    });

    it("getLatestPriceUnsafe works even when stale", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      await time.increase(3601);

      const [price, , reporters] = await oracle.getLatestPriceUnsafe();
      expect(price).to.equal(PRICE_2091);
      expect(reporters).to.equal(3);
    });
  });

  describe("Constants", () => {
    it("has correct constants", async () => {
      expect(await oracle.DECIMALS()).to.equal(8);
      expect(await oracle.STALENESS_THRESHOLD()).to.equal(3600);
      expect(await oracle.MIN_REPORTERS()).to.equal(3);
    });
  });

  describe("Multiple Rounds", () => {
    it("handles consecutive rounds with price updates", async () => {
      // Round 0
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      const [price0] = await oracle.getLatestPrice();
      expect(price0).to.equal(PRICE_2091);

      // Round 1 with different prices
      await oracle.connect(reporter1).submitPrice(PRICE_2100);
      await oracle.connect(reporter2).submitPrice(PRICE_2080);
      await oracle.connect(reporter3).submitPrice(PRICE_2091);

      // Sorted: [2080, 2091, 2100] → median = 2091
      const [price1] = await oracle.getLatestPrice();
      expect(price1).to.equal(PRICE_2091);
      expect(await oracle.currentRoundId()).to.equal(2);
    });

    it("updates timestamp on each round", async () => {
      // Round 0
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);
      const round0 = await oracle.latestRound();

      await time.increase(60);

      // Round 1
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);
      const round1 = await oracle.latestRound();

      expect(round1.timestamp).to.be.greaterThan(round0.timestamp);
    });
  });

  describe("Edge Cases", () => {
    it("handles outlier price without skewing median", async () => {
      const EXTREME_PRICE = 500000000000n; // $5000.00
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await oracle.connect(reporter2).submitPrice(PRICE_2092);
      await oracle.connect(reporter3).submitPrice(EXTREME_PRICE);

      // Sorted: [2091, 2092, 5000] → median = 2092
      const [price] = await oracle.getLatestPrice();
      expect(price).to.equal(PRICE_2092);
    });

    it("handles zero price submission", async () => {
      await oracle.connect(reporter1).submitPrice(0n);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      // Sorted: [0, 2091, 2092] → median = 2091
      const [price] = await oracle.getLatestPrice();
      expect(price).to.equal(PRICE_2091);
    });

    it("handles identical prices from all reporters", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2091);

      const [price] = await oracle.getLatestPrice();
      expect(price).to.equal(PRICE_2091);
    });

    it("removed reporter cannot submit in next round", async () => {
      await oracle.removeReporter(reporter3.address);

      await expect(
        oracle.connect(reporter3).submitPrice(PRICE_2091)
      ).to.be.revertedWithCustomError(oracle, "NotAuthorizedReporter");
    });

    it("freshly added reporter can submit immediately", async () => {
      await oracle.addReporter(reporter4.address);
      await expect(oracle.connect(reporter4).submitPrice(PRICE_2091))
        .to.emit(oracle, "PriceSubmitted");
    });

    it("getLatestPrice succeeds right before staleness threshold", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      // Advance to just under threshold (3599 seconds)
      await time.increase(3599);

      const [price] = await oracle.getLatestPrice();
      expect(price).to.equal(PRICE_2091);
    });
  });
});
