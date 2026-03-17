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

    // Per-round submission tracking
    mapping(uint256 => mapping(address => bool)) private _hasSubmitted;
    uint256 private _submissionCount;
    uint256[] private _currentPrices;

    // ── Events ──────────────────────────────────────────────────────────

    event PriceUpdated(uint256 indexed roundId, uint256 price, uint256 timestamp);
    event ReporterAdded(address indexed reporter);
    event ReporterRemoved(address indexed reporter);
    event PriceSubmitted(uint256 indexed roundId, address indexed reporter, uint256 price);

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

        _hasSubmitted[currentRoundId][msg.sender] = true;
        _currentPrices.push(price);
        _submissionCount++;

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

    // ── Internal ────────────────────────────────────────────────────────

    function _finalizeRound() internal {
        // Copy to memory and sort for median
        uint256[] memory prices = _currentPrices;
        _sort(prices);

        uint256 median = prices[prices.length / 2];

        latestRound = PriceRound({
            price: median,
            timestamp: block.timestamp,
            reporterCount: _submissionCount
        });

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
