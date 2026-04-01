const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PriceOracle", function () {
  let oracle, owner, reporter1, reporter2, reporter3, reporter4, unauthorized;

  const PRICE_2091 = 209100000000n; // $2091.00 with 8 decimals
  const PRICE_2090 = 209000000000n;
  const PRICE_2092 = 209200000000n;
  const PRICE_2100 = 210000000000n;
  const PRICE_2080 = 208000000000n;
  const STAKE_AMOUNT = ethers.parseEther("0.05"); // MIN_STAKE

  async function stakeAll() {
    await oracle.connect(reporter1).stake({ value: STAKE_AMOUNT });
    await oracle.connect(reporter2).stake({ value: STAKE_AMOUNT });
    await oracle.connect(reporter3).stake({ value: STAKE_AMOUNT });
  }

  beforeEach(async () => {
    [owner, reporter1, reporter2, reporter3, reporter4, unauthorized] = await ethers.getSigners();

    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    oracle = await PriceOracle.deploy();

    // Add 3 reporters
    await oracle.addReporter(reporter1.address);
    await oracle.addReporter(reporter2.address);
    await oracle.addReporter(reporter3.address);

    // Stake for all reporters
    await stakeAll();
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

  describe("Staking", () => {
    it("reporter can stake ETH", async () => {
      await oracle.addReporter(reporter4.address);
      await expect(oracle.connect(reporter4).stake({ value: STAKE_AMOUNT }))
        .to.emit(oracle, "ReporterStaked")
        .withArgs(reporter4.address, STAKE_AMOUNT, STAKE_AMOUNT);

      expect(await oracle.reporterStakes(reporter4.address)).to.equal(STAKE_AMOUNT);
    });

    it("non-reporter cannot stake", async () => {
      await expect(
        oracle.connect(unauthorized).stake({ value: STAKE_AMOUNT })
      ).to.be.revertedWithCustomError(oracle, "NotAuthorizedReporter");
    });

    it("reporter can unstake when not mid-round", async () => {
      const unstakeAmount = ethers.parseEther("0.01");
      await expect(oracle.connect(reporter1).unstake(unstakeAmount))
        .to.emit(oracle, "ReporterUnstaked");
      expect(await oracle.reporterStakes(reporter1.address)).to.equal(STAKE_AMOUNT - unstakeAmount);
    });

    it("reporter cannot unstake during active round", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await expect(
        oracle.connect(reporter1).unstake(STAKE_AMOUNT)
      ).to.be.revertedWithCustomError(oracle, "UnstakeDuringRound");
    });

    it("cannot unstake more than staked", async () => {
      await expect(
        oracle.connect(reporter1).unstake(ethers.parseEther("1.0"))
      ).to.be.revertedWithCustomError(oracle, "NoStakeToWithdraw");
    });

    it("submission requires minimum stake", async () => {
      await oracle.addReporter(reporter4.address);
      // reporter4 has no stake
      await expect(
        oracle.connect(reporter4).submitPrice(PRICE_2091)
      ).to.be.revertedWithCustomError(oracle, "InsufficientStake");
    });
  });

  describe("Slashing", () => {
    it("should slash reporter whose price deviates >10% from median", async () => {
      // reporter1 and reporter2 submit close prices, reporter3 submits outlier
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await oracle.connect(reporter2).submitPrice(PRICE_2092);
      // reporter3 submits a 50% higher price (deviation from median $2092)
      // 50% of 2092 is still within the 50% deviation guard, but >10% from median → slash
      // Actually, need to submit within 50% of last price. Since no last price (first round), any price works.
      // But after first round, need to be within 50% of latest. So let's first finalize a round.
      await oracle.connect(reporter3).submitPrice(PRICE_2090); // finalize round 0, median = 2091

      // Now in round 1: submit with one outlier
      const outlierPrice = PRICE_2091 + PRICE_2091 * 11n / 100n; // ~$2321 (11% above median)
      // Check this is within 50% guard of last price (2091)
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await oracle.connect(reporter2).submitPrice(PRICE_2092);

      const stakeBefore = await oracle.reporterStakes(reporter3.address);
      await expect(oracle.connect(reporter3).submitPrice(outlierPrice))
        .to.emit(oracle, "ReporterSlashed");

      const stakeAfter = await oracle.reporterStakes(reporter3.address);
      // Slashed 20% of stake
      const expectedSlash = stakeBefore * 2000n / 10000n;
      expect(stakeBefore - stakeAfter).to.equal(expectedSlash);
    });

    it("should NOT slash reporters within 10% deviation", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await oracle.connect(reporter2).submitPrice(PRICE_2092);
      // All within 10% of median
      await oracle.connect(reporter3).submitPrice(PRICE_2090);

      // All reporters should keep their full stakes
      expect(await oracle.reporterStakes(reporter1.address)).to.equal(STAKE_AMOUNT);
      expect(await oracle.reporterStakes(reporter2.address)).to.equal(STAKE_AMOUNT);
      expect(await oracle.reporterStakes(reporter3.address)).to.equal(STAKE_AMOUNT);
    });

    it("owner can claim slashed funds", async () => {
      // First round to establish a price
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await oracle.connect(reporter2).submitPrice(PRICE_2092);
      await oracle.connect(reporter3).submitPrice(PRICE_2090);

      // Second round with outlier
      const outlierPrice = PRICE_2091 + PRICE_2091 * 11n / 100n;
      await oracle.connect(reporter1).submitPrice(PRICE_2091);
      await oracle.connect(reporter2).submitPrice(PRICE_2092);
      await oracle.connect(reporter3).submitPrice(outlierPrice);

      const slashedPool = await oracle.slashedFundsPool();
      expect(slashedPool).to.be.greaterThan(0);

      await expect(oracle.claimSlashedFunds())
        .to.emit(oracle, "SlashedFundsClaimed");

      expect(await oracle.slashedFundsPool()).to.equal(0);
    });
  });

  describe("Chainlink AggregatorV3 Interface", () => {
    it("latestRoundData returns correct format", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await oracle.latestRoundData();
      expect(answer).to.equal(PRICE_2091);
      expect(startedAt).to.be.greaterThan(0);
      expect(updatedAt).to.equal(startedAt);
      expect(roundId).to.equal(answeredInRound);
    });

    it("decimals returns 8", async () => {
      expect(await oracle.decimals()).to.equal(8);
    });

    it("description returns ETH/USD", async () => {
      expect(await oracle.description()).to.equal("ETH/USD");
    });

    it("version returns 1", async () => {
      expect(await oracle.version()).to.equal(1);
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
      await expect(oracle.getLatestPrice()).to.be.revertedWithCustomError(oracle, "NoPrice");
    });
  });

  describe("Round Finalization (Median)", () => {
    it("finalizes round when MIN_REPORTERS submit (3 reporters → median)", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2092);
      await expect(oracle.connect(reporter3).submitPrice(PRICE_2091))
        .to.emit(oracle, "PriceUpdated");

      const [price, timestamp] = await oracle.getLatestPrice();
      expect(price).to.equal(PRICE_2091);
      expect(timestamp).to.be.greaterThan(0);
    });

    it("median selects middle value from odd number of submissions", async () => {
      await oracle.addReporter(reporter4.address);
      await oracle.connect(reporter4).stake({ value: STAKE_AMOUNT });

      await oracle.connect(reporter1).submitPrice(PRICE_2080);
      await oracle.connect(reporter2).submitPrice(PRICE_2100);
      await oracle.connect(reporter3).submitPrice(PRICE_2091);

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
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

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
      expect(await oracle.MIN_STAKE()).to.equal(STAKE_AMOUNT);
      expect(await oracle.SLASH_THRESHOLD_BPS()).to.equal(1000);
      expect(await oracle.SLASH_PENALTY_BPS()).to.equal(2000);
    });
  });

  describe("Multiple Rounds", () => {
    it("handles consecutive rounds with price updates", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      const [price0] = await oracle.getLatestPrice();
      expect(price0).to.equal(PRICE_2091);

      await oracle.connect(reporter1).submitPrice(PRICE_2100);
      await oracle.connect(reporter2).submitPrice(PRICE_2080);
      await oracle.connect(reporter3).submitPrice(PRICE_2091);

      const [price1] = await oracle.getLatestPrice();
      expect(price1).to.equal(PRICE_2091);
      expect(await oracle.currentRoundId()).to.equal(2);
    });

    it("updates timestamp on each round", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);
      const round0 = await oracle.latestRound();

      await time.increase(60);

      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);
      const round1 = await oracle.latestRound();

      expect(round1.timestamp).to.be.greaterThan(round0.timestamp);
    });
  });

  describe("Edge Cases", () => {
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

    it("freshly added reporter can submit immediately after staking", async () => {
      await oracle.addReporter(reporter4.address);
      await oracle.connect(reporter4).stake({ value: STAKE_AMOUNT });
      await expect(oracle.connect(reporter4).submitPrice(PRICE_2091))
        .to.emit(oracle, "PriceSubmitted");
    });

    it("getLatestPrice succeeds right before staleness threshold", async () => {
      await oracle.connect(reporter1).submitPrice(PRICE_2090);
      await oracle.connect(reporter2).submitPrice(PRICE_2091);
      await oracle.connect(reporter3).submitPrice(PRICE_2092);

      await time.increase(3599);

      const [price] = await oracle.getLatestPrice();
      expect(price).to.equal(PRICE_2091);
    });
  });
});
