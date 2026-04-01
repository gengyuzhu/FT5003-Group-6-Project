// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PriceOracle
 * @notice Economic-incentive oracle: reporters must stake ETH to submit prices.
 *         Outlier reporters (>10% deviation from median) are slashed 20% of stake.
 *         Implements Chainlink AggregatorV3 interface for drop-in compatibility.
 *
 *         Design rationale (ASTREA-inspired):
 *         - Staking requirement aligns reporter incentives with accuracy
 *         - Slashing makes lying economically irrational (cost > gain)
 *         - Chainlink-compatible interface enables zero-code migration to production feeds
 */
contract PriceOracle is Ownable, ReentrancyGuard {

    // ── Custom Errors ────────────────────────────────────────────────────

    error NotAuthorizedReporter();
    error StalePrice();
    error AlreadySubmitted();
    error NoPrice();
    error PriceDeviationTooHigh();
    error RoundTooFrequent();
    error InsufficientStake();
    error NoStakeToWithdraw();
    error UnstakeDuringRound();
    error TransferFailed();

    // ── Types ───────────────────────────────────────────────────────────

    struct PriceRound {
        uint256 price;         // 8 decimals (e.g., 209100000000 = $2091.00)
        uint256 timestamp;
        uint256 reporterCount;
    }

    // ── Constants ───────────────────────────────────────────────────────

    uint256 public constant DECIMALS = 8;
    uint256 public constant STALENESS_THRESHOLD = 1 hours;
    uint256 public constant MIN_REPORTERS = 3;
    uint256 public constant MAX_HISTORY = 10;
    uint256 public constant MIN_STAKE = 0.05 ether;
    uint256 public constant SLASH_THRESHOLD_BPS = 1000;   // 10 % deviation triggers slash
    uint256 public constant SLASH_PENALTY_BPS = 2000;     // 20 % of stake is slashed
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ── State ───────────────────────────────────────────────────────────

    mapping(address => bool) public authorizedReporters;
    uint256 public reporterCount;

    PriceRound public latestRound;
    uint256 public currentRoundId;

    // Price history (last 10 finalized rounds)
    PriceRound[] public priceHistory;

    // Per-round submission tracking
    mapping(uint256 => mapping(address => bool)) private _hasSubmitted;
    uint256 private _submissionCount;
    uint256[] private _currentPrices;
    address[] private _currentReporters;
    mapping(uint256 => mapping(address => uint256)) private _reporterPriceForRound;

    // Reporter performance & staking
    mapping(address => uint256) public reporterSubmissions;
    mapping(address => uint256) public reporterStakes;

    // Slashing pool (owner can claim)
    uint256 public slashedFundsPool;

    // Emergency price override
    bool public emergencyPriceActive;

    // Anti-flash-loan: minimum interval between round finalizations
    uint256 public minRoundInterval;

    // ── Events ──────────────────────────────────────────────────────────

    event PriceUpdated(uint256 indexed roundId, uint256 price, uint256 timestamp);
    event ReporterAdded(address indexed reporter);
    event ReporterRemoved(address indexed reporter);
    event PriceSubmitted(uint256 indexed roundId, address indexed reporter, uint256 price);
    event EmergencyPriceSet(uint256 price, uint256 timestamp);
    event MinRoundIntervalUpdated(uint256 newInterval);
    event ReporterStaked(address indexed reporter, uint256 amount, uint256 totalStake);
    event ReporterUnstaked(address indexed reporter, uint256 amount, uint256 totalStake);
    event ReporterSlashed(address indexed reporter, uint256 slashAmount, uint256 reportedPrice, uint256 medianPrice);
    event SlashedFundsClaimed(address indexed recipient, uint256 amount);

    // ── Constructor ─────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ── Reporter Management ─────────────────────────────────────────────

    function addReporter(address reporter) external onlyOwner {
        if (!authorizedReporters[reporter]) {
            authorizedReporters[reporter] = true;
            reporterCount++;
            emit ReporterAdded(reporter);
        }
    }

    function removeReporter(address reporter) external onlyOwner {
        if (authorizedReporters[reporter]) {
            authorizedReporters[reporter] = false;
            reporterCount--;
            emit ReporterRemoved(reporter);
        }
    }

    // ── Staking ─────────────────────────────────────────────────────────

    /**
     * @notice Stake ETH to become eligible for price submission.
     *         Minimum stake: 0.05 ETH. Reporters must maintain >= MIN_STAKE to submit.
     */
    function stake() external payable {
        if (!authorizedReporters[msg.sender]) revert NotAuthorizedReporter();
        reporterStakes[msg.sender] += msg.value;
        emit ReporterStaked(msg.sender, msg.value, reporterStakes[msg.sender]);
    }

    /**
     * @notice Withdraw staked ETH. Cannot unstake during an active round
     *         (after submitting but before finalization) to prevent gaming.
     */
    function unstake(uint256 amount) external nonReentrant {
        if (reporterStakes[msg.sender] < amount) revert NoStakeToWithdraw();
        if (_hasSubmitted[currentRoundId][msg.sender]) revert UnstakeDuringRound();
        reporterStakes[msg.sender] -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit ReporterUnstaked(msg.sender, amount, reporterStakes[msg.sender]);
    }

    /**
     * @notice Owner claims accumulated slashed funds (from dishonest reporters).
     */
    function claimSlashedFunds() external onlyOwner nonReentrant {
        uint256 amount = slashedFundsPool;
        if (amount == 0) revert NoStakeToWithdraw();
        slashedFundsPool = 0;
        (bool ok, ) = payable(owner()).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit SlashedFundsClaimed(owner(), amount);
    }

    // ── Price Submission ────────────────────────────────────────────────

    /**
     * @notice Submit a price for the current round.
     *         Reporter must be authorized and have >= MIN_STAKE.
     *         If the submission triggers finalization and the reporter's price
     *         deviates >10% from median, 20% of their stake is slashed.
     * @param price Price with 8 decimals (e.g., 209100000000 for $2091.00).
     */
    function submitPrice(uint256 price) external {
        if (!authorizedReporters[msg.sender]) revert NotAuthorizedReporter();
        if (_hasSubmitted[currentRoundId][msg.sender]) revert AlreadySubmitted();
        if (reporterStakes[msg.sender] < MIN_STAKE) revert InsufficientStake();

        // Reject prices that deviate more than 50% from the last finalized price
        if (latestRound.timestamp > 0) {
            uint256 lastPrice = latestRound.price;
            uint256 deviation = price > lastPrice ? price - lastPrice : lastPrice - price;
            if (deviation * 100 > lastPrice * 50) revert PriceDeviationTooHigh();
        }

        _hasSubmitted[currentRoundId][msg.sender] = true;
        _currentPrices.push(price);
        _currentReporters.push(msg.sender);
        _reporterPriceForRound[currentRoundId][msg.sender] = price;
        _submissionCount++;
        reporterSubmissions[msg.sender]++;

        emit PriceSubmitted(currentRoundId, msg.sender, price);

        if (_submissionCount >= MIN_REPORTERS) {
            _finalizeRound();
        }
    }

    // ── View Functions ──────────────────────────────────────────────────

    function getLatestPrice() external view returns (uint256 price, uint256 timestamp) {
        if (latestRound.timestamp == 0) revert NoPrice();
        if (block.timestamp - latestRound.timestamp > STALENESS_THRESHOLD) revert StalePrice();
        return (latestRound.price, latestRound.timestamp);
    }

    function getLatestPriceUnsafe() external view returns (uint256 price, uint256 timestamp, uint256 reporters) {
        return (latestRound.price, latestRound.timestamp, latestRound.reporterCount);
    }

    function getCurrentRoundSubmissions() external view returns (uint256) {
        return _submissionCount;
    }

    function hasSubmitted(address reporter) external view returns (bool) {
        return _hasSubmitted[currentRoundId][reporter];
    }

    function getPriceHistory() external view returns (PriceRound[] memory) {
        return priceHistory;
    }

    function getPriceHistoryLength() external view returns (uint256) {
        return priceHistory.length;
    }

    /**
     * @notice Emergency price override (owner only).
     */
    function emergencySetPrice(uint256 price) external onlyOwner {
        if (price == 0) revert NoPrice();
        latestRound = PriceRound({
            price: price,
            timestamp: block.timestamp,
            reporterCount: 0
        });
        emergencyPriceActive = true;

        if (priceHistory.length < MAX_HISTORY) {
            priceHistory.push(latestRound);
        } else {
            priceHistory[currentRoundId % MAX_HISTORY] = latestRound;
        }

        emit EmergencyPriceSet(price, block.timestamp);
    }

    /**
     * @notice Price volatility from stored history as basis points.
     */
    function getVolatility() external view returns (uint256 volatilityBps, uint256 sampleCount) {
        sampleCount = priceHistory.length;
        if (sampleCount < 2) return (0, sampleCount);

        uint256 minPrice = type(uint256).max;
        uint256 maxPrice = 0;
        uint256 totalPrice = 0;

        for (uint256 i = 0; i < sampleCount; i++) {
            uint256 p = priceHistory[i].price;
            if (p < minPrice) minPrice = p;
            if (p > maxPrice) maxPrice = p;
            totalPrice += p;
        }

        uint256 avgPrice = totalPrice / sampleCount;
        if (avgPrice == 0) return (0, sampleCount);

        volatilityBps = (maxPrice - minPrice) * BPS_DENOMINATOR / avgPrice;
    }

    function setMinRoundInterval(uint256 interval) external onlyOwner {
        minRoundInterval = interval;
        emit MinRoundIntervalUpdated(interval);
    }

    /**
     * @notice Time-Weighted Average Price (TWAP) from price history.
     */
    function getTWAP() external view returns (uint256 twapPrice, uint256 sampleCount) {
        sampleCount = priceHistory.length;
        if (sampleCount == 0) revert NoPrice();
        if (sampleCount == 1) return (priceHistory[0].price, 1);

        uint256 weightedSum = 0;
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < sampleCount - 1; i++) {
            uint256 duration = priceHistory[i + 1].timestamp - priceHistory[i].timestamp;
            weightedSum += priceHistory[i].price * duration;
            totalWeight += duration;
        }

        uint256 lastDuration = block.timestamp - priceHistory[sampleCount - 1].timestamp;
        weightedSum += priceHistory[sampleCount - 1].price * lastDuration;
        totalWeight += lastDuration;

        if (totalWeight == 0) return (priceHistory[sampleCount - 1].price, sampleCount);
        twapPrice = weightedSum / totalWeight;
    }

    function forceAdvanceRound() external onlyOwner {
        currentRoundId++;
        _submissionCount = 0;
        delete _currentPrices;
        delete _currentReporters;
    }

    // ── Chainlink AggregatorV3 Compatible Interface ─────────────────────

    /**
     * @notice Chainlink-compatible latestRoundData().
     *         Allows any system expecting a Chainlink feed to use this oracle
     *         with zero code changes. Enables seamless migration to production Chainlink.
     */
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        uint256 rid = currentRoundId > 0 ? currentRoundId - 1 : 0;
        return (
            uint80(rid),
            int256(latestRound.price),
            latestRound.timestamp,
            latestRound.timestamp,
            uint80(rid)
        );
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "ETH/USD";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    // ── Internal ────────────────────────────────────────────────────────

    function _finalizeRound() internal {
        // Anti-flash-loan: enforce minimum interval between round finalizations
        if (minRoundInterval > 0 && latestRound.timestamp > 0) {
            if (block.timestamp - latestRound.timestamp < minRoundInterval) revert RoundTooFrequent();
        }

        // Copy to memory and sort for median
        uint256[] memory prices = _currentPrices;
        _sort(prices);
        uint256 median = prices[prices.length / 2];

        // ── Slash outlier reporters (>10% deviation from median) ────────
        if (median > 0) {
            uint256 threshold = median * SLASH_THRESHOLD_BPS / BPS_DENOMINATOR;
            for (uint256 i = 0; i < _currentReporters.length; i++) {
                address reporter = _currentReporters[i];
                uint256 reported = _reporterPriceForRound[currentRoundId][reporter];
                uint256 dev = reported > median ? reported - median : median - reported;
                if (dev > threshold && reporterStakes[reporter] > 0) {
                    uint256 slashAmount = reporterStakes[reporter] * SLASH_PENALTY_BPS / BPS_DENOMINATOR;
                    reporterStakes[reporter] -= slashAmount;
                    slashedFundsPool += slashAmount;
                    emit ReporterSlashed(reporter, slashAmount, reported, median);
                }
            }
        }

        latestRound = PriceRound({
            price: median,
            timestamp: block.timestamp,
            reporterCount: _submissionCount
        });

        // Store in price history (circular buffer, max 10 entries)
        if (priceHistory.length < MAX_HISTORY) {
            priceHistory.push(latestRound);
        } else {
            priceHistory[currentRoundId % MAX_HISTORY] = latestRound;
        }

        emergencyPriceActive = false;

        emit PriceUpdated(currentRoundId, median, block.timestamp);

        // Reset for next round
        currentRoundId++;
        _submissionCount = 0;
        delete _currentPrices;
        delete _currentReporters;
    }

    function _sort(uint256[] memory arr) internal pure {
        for (uint256 i = 1; i < arr.length; i++) {
            uint256 key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] > key) {
                arr[j] = arr[j - 1];
                j--;
            }
            arr[j] = key;
        }
    }
}
