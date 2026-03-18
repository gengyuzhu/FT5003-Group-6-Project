// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleOracle
 * @notice On-chain price oracle with multi-reporter median aggregation.
 *         Authorized reporters submit ETH/USD prices per round.
 *         Once MIN_REPORTERS have submitted, the round finalizes with the median price.
 */
contract SimpleOracle is Ownable {

    // ── Custom Errors ────────────────────────────────────────────────────

    error NotAuthorizedReporter();
    error StalePrice();
    error AlreadySubmitted();
    error NoPrice();
    error PriceDeviationTooHigh();
    error RoundTooFrequent();

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

    // ── State ───────────────────────────────────────────────────────────

    mapping(address => bool) public authorizedReporters;
    uint256 public reporterCount;

    PriceRound public latestRound;
    uint256 public currentRoundId;

    // Price history (last 10 finalized rounds for trend transparency)
    uint256 public constant MAX_HISTORY = 10;
    PriceRound[] public priceHistory;

    // Per-round submission tracking
    mapping(uint256 => mapping(address => bool)) private _hasSubmitted;
    uint256 private _submissionCount;
    uint256[] private _currentPrices;

    // Reporter performance tracking
    mapping(address => uint256) public reporterSubmissions;

    // Emergency price override
    bool public emergencyPriceActive;

    // Minimum interval between round finalizations (anti-flash-loan)
    uint256 public minRoundInterval;

    // ── Events ──────────────────────────────────────────────────────────

    event PriceUpdated(uint256 indexed roundId, uint256 price, uint256 timestamp);
    event ReporterAdded(address indexed reporter);
    event ReporterRemoved(address indexed reporter);
    event PriceSubmitted(uint256 indexed roundId, address indexed reporter, uint256 price);
    event EmergencyPriceSet(uint256 price, uint256 timestamp);
    event MinRoundIntervalUpdated(uint256 newInterval);

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

    // ── Price Submission ────────────────────────────────────────────────

    /**
     * @notice Submit a price for the current round.
     * @param price Price with 8 decimals (e.g., 209100000000 for $2091.00).
     */
    function submitPrice(uint256 price) external {
        if (!authorizedReporters[msg.sender]) revert NotAuthorizedReporter();
        if (_hasSubmitted[currentRoundId][msg.sender]) revert AlreadySubmitted();

        // Reject prices that deviate more than 50% from the last finalized price
        if (latestRound.timestamp > 0) {
            uint256 lastPrice = latestRound.price;
            uint256 deviation = price > lastPrice ? price - lastPrice : lastPrice - price;
            if (deviation * 100 > lastPrice * 50) revert PriceDeviationTooHigh();
        }

        _hasSubmitted[currentRoundId][msg.sender] = true;
        _currentPrices.push(price);
        _submissionCount++;
        reporterSubmissions[msg.sender]++;

        emit PriceSubmitted(currentRoundId, msg.sender, price);

        // Finalize round when enough reporters have submitted
        if (_submissionCount >= MIN_REPORTERS) {
            _finalizeRound();
        }
    }

    // ── View Functions ──────────────────────────────────────────────────

    /**
     * @notice Get the latest finalized price.
     * @return price     Price with 8 decimals.
     * @return timestamp When the round was finalized.
     */
    function getLatestPrice() external view returns (uint256 price, uint256 timestamp) {
        if (latestRound.timestamp == 0) revert NoPrice();
        if (block.timestamp - latestRound.timestamp > STALENESS_THRESHOLD) revert StalePrice();
        return (latestRound.price, latestRound.timestamp);
    }

    /**
     * @notice Get the latest price without staleness check (for UI display).
     */
    function getLatestPriceUnsafe() external view returns (uint256 price, uint256 timestamp, uint256 reporters) {
        return (latestRound.price, latestRound.timestamp, latestRound.reporterCount);
    }

    function getCurrentRoundSubmissions() external view returns (uint256) {
        return _submissionCount;
    }

    /// @notice Check whether a reporter has already submitted for the current round.
    function hasSubmitted(address reporter) external view returns (bool) {
        return _hasSubmitted[currentRoundId][reporter];
    }

    /// @notice Get all stored price history entries (up to last 10 finalized rounds).
    function getPriceHistory() external view returns (PriceRound[] memory) {
        return priceHistory;
    }

    /// @notice Get the number of stored price history entries.
    function getPriceHistoryLength() external view returns (uint256) {
        return priceHistory.length;
    }

    /**
     * @notice Emergency price override (owner only). Sets the oracle price
     *         directly when reporters are unavailable. Bypasses reporter flow.
     *         Use sparingly — only when normal oracle rounds are stuck.
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
     * @notice Get price volatility from stored history as basis points.
     *         Returns (maxPrice - minPrice) * 10000 / avgPrice.
     *         Higher values indicate more volatile price movement.
     * @return volatilityBps Volatility in basis points (0 = stable, 500 = 5% spread).
     * @return sampleCount   Number of history entries used.
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

    /// @notice BPS denominator for volatility calculation.
    uint256 private constant BPS_DENOMINATOR = 10_000;

    /**
     * @notice Set minimum interval between round finalizations (owner only).
     *         Prevents flash-loan-speed price manipulation by requiring a cooldown
     *         between consecutive rounds. Set to 0 to disable.
     * @param interval Minimum seconds between round finalizations.
     */
    function setMinRoundInterval(uint256 interval) external onlyOwner {
        minRoundInterval = interval;
        emit MinRoundIntervalUpdated(interval);
    }

    /**
     * @notice Calculate Time-Weighted Average Price (TWAP) from price history.
     *         Standard DeFi mechanism used by Uniswap V3 and other protocols.
     *         More manipulation-resistant than spot price since it averages
     *         price over time, requiring sustained manipulation to skew.
     * @return twapPrice The time-weighted average price (8 decimals).
     * @return sampleCount Number of history entries used.
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

        // Last entry weighted until now
        uint256 lastDuration = block.timestamp - priceHistory[sampleCount - 1].timestamp;
        weightedSum += priceHistory[sampleCount - 1].price * lastDuration;
        totalWeight += lastDuration;

        if (totalWeight == 0) return (priceHistory[sampleCount - 1].price, sampleCount);
        twapPrice = weightedSum / totalWeight;
    }

    /// @notice Force-advance to the next round (owner only). Use if a round is stuck.
    function forceAdvanceRound() external onlyOwner {
        currentRoundId++;
        _submissionCount = 0;
        delete _currentPrices;
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

        emergencyPriceActive = false; // Normal round clears emergency flag

        emit PriceUpdated(currentRoundId, median, block.timestamp);

        // Reset for next round
        currentRoundId++;
        _submissionCount = 0;
        delete _currentPrices;
    }

    /**
     * @dev Insertion sort (sufficient for small arrays of reporter prices).
     */
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
