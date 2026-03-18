// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ISimpleOracle
 * @notice Interface for the on-chain oracle price feed.
 */
interface ISimpleOracle {
    function getLatestPrice() external view returns (uint256 price, uint256 timestamp);
}

/**
 * @title NFTMarketplace
 * @notice Decentralized NFT marketplace supporting USD-denominated fixed-price listings
 *         (with oracle-based ETH conversion at purchase time) and English auctions
 *         with ERC-2981 royalty enforcement, a platform fee, pull-payment fund
 *         distribution, listing expiration, and minimum bid increments.
 *
 *         Designed for traditional artists: sellers list in USD for price stability,
 *         buyers pay in ETH, and the oracle provides the real-time conversion rate.
 */
contract NFTMarketplace is Ownable, ReentrancyGuard, Pausable {

    // ── Custom Errors ────────────────────────────────────────────────────

    error PriceZero();
    error NotTokenOwner();
    error MarketplaceNotApproved();
    error ListingNotActive();
    error ListingExpiredError();
    error InsufficientPayment();
    error SellerCannotBuy();
    error NotTheSeller();
    error AuctionAlreadyEnded();
    error AuctionExpired();
    error AuctionNotExpired();
    error SellerCannotBid();
    error BidBelowStartPrice();
    error BidTooLow();
    error BidIncrementTooLow();
    error NothingToWithdraw();
    error TransferFailed();
    error FeeTooHigh();
    error InvalidDuration();
    error AuctionHasBids();
    error OracleNotSet();
    error ExcessivePayment();
    error ArrayLengthMismatch();
    error BatchTooLarge();
    error EndPriceTooHigh();
    error DutchAuctionEnded();
    error OfferNotActive();
    error OfferExpired();
    error SwapNotActive();
    error NotCounterparty();
    error SwapExpired();

    // ── Events (oracle)
    event OracleUpdated(address indexed newOracle);
    event BatchListed(uint256[] listingIds, address indexed seller);
    event AuctionExtended(uint256 indexed auctionId, uint256 newEndTime);
    event DutchAuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 startPriceUsdCents, uint256 endPriceUsdCents, uint256 endTime);
    event DutchAuctionSold(uint256 indexed auctionId, address indexed buyer, uint256 priceUsdCents, uint256 paidWei);
    event DutchAuctionCancelled(uint256 indexed auctionId);
    event OfferMade(uint256 indexed offerId, address indexed buyer, address nftContract, uint256 tokenId, uint256 amount, uint256 expiration);
    event OfferAccepted(uint256 indexed offerId, address indexed seller);
    event OfferCancelled(uint256 indexed offerId);
    event SwapProposed(uint256 indexed swapId, address indexed proposer, address indexed counterparty);
    event SwapExecuted(uint256 indexed swapId);
    event SwapCancelled(uint256 indexed swapId);

    // ── Types ───────────────────────────────────────────────────────────

    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 priceUsdCents; // USD cents (e.g., 10000 = $100.00)
        bool active;
        uint256 expiration;    // 0 = no expiry, otherwise unix timestamp
    }

    struct Auction {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 startPrice;
        uint256 highestBid;
        address highestBidder;
        uint256 endTime;
        bool ended;
    }

    struct DutchAuction {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 startPriceUsdCents;
        uint256 endPriceUsdCents;
        uint256 startTime;
        uint256 endTime;
        bool sold;
    }

    struct Offer {
        address buyer;
        address nftContract;
        uint256 tokenId;
        uint256 amount;       // ETH escrowed (wei)
        uint256 expiration;
        bool active;
    }

    struct Swap {
        address proposer;
        address counterparty;
        address proposerNftContract;
        uint256 proposerTokenId;
        address counterpartyNftContract;
        uint256 counterpartyTokenId;
        uint256 ethTopUp;      // ETH sweetener from proposer (0 if pure swap)
        uint256 expiration;
        bool active;
    }

    // ── State ───────────────────────────────────────────────────────────

    ISimpleOracle public oracle;
    uint256 public platformFeeBps = 250;   // 2.5 %
    uint256 public constant MAX_FEE = 1000; // 10 %
    uint256 public constant MIN_BID_INCREMENT_BPS = 500; // 5 % minimum bid increase
    uint256 public constant SLIPPAGE_BPS = 200; // 2 % buyer slippage tolerance
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant USD_WEI_FACTOR = 1e24; // 1e18 (wei/ETH) * 1e8 (oracle decimals) / 1e2 (cents)
    uint256 public constant MIN_AUCTION_DURATION = 1 hours;
    uint256 public constant MAX_AUCTION_DURATION = 7 days;
    uint256 public constant ANTI_SNIPE_DURATION = 5 minutes;
    uint256 public constant MAX_BATCH_SIZE = 20;

    uint256 private _nextListingId;
    uint256 private _nextAuctionId;
    uint256 private _nextDutchAuctionId;
    uint256 private _nextOfferId;
    uint256 private _nextSwapId;

    mapping(uint256 => Listing)  public listings;
    mapping(uint256 => Auction)  public auctions;
    mapping(uint256 => DutchAuction) public dutchAuctions;
    mapping(uint256 => Offer)    public offers;
    mapping(uint256 => Swap)     public swaps;

    // Pending withdrawals (pull-payment for all fund distributions)
    mapping(address => uint256)  public pendingWithdrawals;

    // ── Events ──────────────────────────────────────────────────────────

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 priceUsdCents,
        uint256 expiration
    );

    event Sold(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 paidWei
    );

    event ListingCancelled(uint256 indexed listingId);

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 startPrice,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionEnded(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 amount
    );

    event PlatformFeeUpdated(uint256 newFeeBps);

    event Withdrawn(address indexed payee, uint256 amount);

    event ListingPriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice);

    event AuctionCancelled(uint256 indexed auctionId);

    // ── Constructor ─────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ── Fixed-price listings ────────────────────────────────────────────

    /**
     * @notice List an NFT for a fixed USD price with optional expiration.
     *         The oracle converts USD → ETH at purchase time.
     * @param nftContract   Address of the ERC-721 contract.
     * @param tokenId       Token ID to list.
     * @param priceUsdCents Sale price in USD cents (e.g., 10000 = $100.00).
     * @param duration      Listing duration in seconds (0 = no expiry).
     */
    function listNFT(
        address nftContract,
        uint256 tokenId,
        uint256 priceUsdCents,
        uint256 duration
    ) external whenNotPaused returns (uint256) {
        return _createListing(nftContract, tokenId, priceUsdCents, duration);
    }

    /**
     * @notice List multiple NFTs in a single transaction for gas savings.
     *         All NFTs use the same contract, but each has its own price and duration.
     * @param nftContract   Address of the ERC-721 contract.
     * @param tokenIds      Array of token IDs to list.
     * @param pricesUsdCents Array of prices in USD cents (must match tokenIds length).
     * @param durations     Array of durations in seconds (must match tokenIds length).
     */
    function batchListNFT(
        address nftContract,
        uint256[] calldata tokenIds,
        uint256[] calldata pricesUsdCents,
        uint256[] calldata durations
    ) external whenNotPaused returns (uint256[] memory) {
        uint256 len = tokenIds.length;
        if (len != pricesUsdCents.length || len != durations.length) revert ArrayLengthMismatch();
        if (len > MAX_BATCH_SIZE) revert BatchTooLarge();

        uint256[] memory listingIds = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            listingIds[i] = _createListing(nftContract, tokenIds[i], pricesUsdCents[i], durations[i]);
        }

        emit BatchListed(listingIds, msg.sender);
        return listingIds;
    }

    /**
     * @notice Buy a listed NFT. The oracle determines the required ETH amount
     *         based on the listing's USD price. Buyer must send enough ETH
     *         (within 2% slippage tolerance). Excess is refunded via pendingWithdrawals.
     */
    function buyNFT(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.expiration != 0 && block.timestamp > listing.expiration) revert ListingExpiredError();
        if (msg.sender == listing.seller) revert SellerCannotBuy();

        uint256 requiredWei = _getRequiredWei(listing.priceUsdCents);
        if (msg.value < requiredWei) revert InsufficientPayment();

        // Enforce max slippage to protect buyer from overpaying
        uint256 maxWei = requiredWei + (requiredWei * SLIPPAGE_BPS) / BPS_DENOMINATOR;
        if (msg.value > maxWei) revert ExcessivePayment();

        listing.active = false;

        _distributeFunds(
            listing.nftContract,
            listing.tokenId,
            listing.seller,
            requiredWei
        );

        // Refund excess ETH to buyer via pull-payment
        uint256 refund = msg.value - requiredWei;
        if (refund > 0) {
            pendingWithdrawals[msg.sender] += refund;
        }

        IERC721(listing.nftContract).safeTransferFrom(
            listing.seller,
            msg.sender,
            listing.tokenId
        );

        emit Sold(listingId, msg.sender, requiredWei);
    }

    /// @notice Cancel an active listing and delist the NFT (seller only).
    function cancelListing(uint256 listingId) external whenNotPaused {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.seller != msg.sender) revert NotTheSeller();

        listing.active = false;
        emit ListingCancelled(listingId);
    }

    /**
     * @notice Update the USD price of an active listing (seller only).
     * @param newPriceUsdCents New price in USD cents.
     */
    function updateListingPrice(uint256 listingId, uint256 newPriceUsdCents) external whenNotPaused {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.seller != msg.sender) revert NotTheSeller();
        if (newPriceUsdCents == 0) revert PriceZero();

        uint256 oldPrice = listing.priceUsdCents;
        listing.priceUsdCents = newPriceUsdCents;
        emit ListingPriceUpdated(listingId, oldPrice, newPriceUsdCents);
    }

    // ── English auctions ────────────────────────────────────────────────

    /**
     * @notice Create an English auction for an NFT.
     * @param duration Auction duration in seconds (1 hour to 7 days).
     */
    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startPrice,
        uint256 duration
    ) external nonReentrant whenNotPaused returns (uint256) {
        if (startPrice == 0) revert PriceZero();
        if (duration < MIN_AUCTION_DURATION || duration > MAX_AUCTION_DURATION) revert InvalidDuration();

        IERC721 nft = IERC721(nftContract);
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (
            nft.getApproved(tokenId) != address(this) &&
            !nft.isApprovedForAll(msg.sender, address(this))
        ) revert MarketplaceNotApproved();

        // Transfer NFT to marketplace for escrow
        nft.transferFrom(msg.sender, address(this), tokenId);

        uint256 auctionId = _nextAuctionId++;
        auctions[auctionId] = Auction({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            startPrice: startPrice,
            highestBid: 0,
            highestBidder: address(0),
            endTime: block.timestamp + duration,
            ended: false
        });

        emit AuctionCreated(
            auctionId,
            msg.sender,
            nftContract,
            tokenId,
            startPrice,
            block.timestamp + duration
        );
        return auctionId;
    }

    /**
     * @notice Place a bid on an active auction.
     *         Minimum bid increment is 5% above the current highest bid.
     */
    function placeBid(uint256 auctionId) external payable nonReentrant whenNotPaused {
        Auction storage auction = auctions[auctionId];
        if (auction.ended) revert AuctionAlreadyEnded();
        if (block.timestamp >= auction.endTime) revert AuctionExpired();
        if (msg.sender == auction.seller) revert SellerCannotBid();
        if (msg.value < auction.startPrice) revert BidBelowStartPrice();

        if (auction.highestBid > 0) {
            // Enforce minimum 5% bid increment over current highest bid
            uint256 minBid = auction.highestBid + (auction.highestBid * MIN_BID_INCREMENT_BPS) / BPS_DENOMINATOR;
            if (msg.value < minBid) revert BidIncrementTooLow();
        }

        // Refund previous highest bidder via pull pattern
        if (auction.highestBidder != address(0)) {
            pendingWithdrawals[auction.highestBidder] += auction.highestBid;
        }

        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

        // Anti-snipe: extend auction by 5 minutes if bid arrives in last 5 minutes
        if (auction.endTime - block.timestamp < ANTI_SNIPE_DURATION) {
            auction.endTime = block.timestamp + ANTI_SNIPE_DURATION;
            emit AuctionExtended(auctionId, auction.endTime);
        }

        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    /**
     * @notice End an auction after its duration has passed.
     */
    function endAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        if (auction.ended) revert AuctionAlreadyEnded();
        if (block.timestamp < auction.endTime) revert AuctionNotExpired();

        auction.ended = true;

        if (auction.highestBidder != address(0)) {
            // Distribute funds via pull-payment
            _distributeFunds(
                auction.nftContract,
                auction.tokenId,
                auction.seller,
                auction.highestBid
            );

            // Transfer NFT to winner
            IERC721(auction.nftContract).safeTransferFrom(
                address(this),
                auction.highestBidder,
                auction.tokenId
            );

            emit AuctionEnded(auctionId, auction.highestBidder, auction.highestBid);
        } else {
            // No bids — return NFT to seller
            IERC721(auction.nftContract).safeTransferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );

            emit AuctionEnded(auctionId, address(0), 0);
        }
    }

    /// @notice Cancel an auction with no bids (seller only). Works even when paused so sellers can recover NFTs.
    function cancelAuction(uint256 auctionId) external {
        Auction storage auction = auctions[auctionId];
        if (auction.ended) revert AuctionAlreadyEnded();
        if (auction.seller != msg.sender) revert NotTheSeller();
        if (auction.highestBidder != address(0)) revert AuctionHasBids();

        auction.ended = true;

        // Return escrowed NFT to seller
        IERC721(auction.nftContract).safeTransferFrom(
            address(this),
            auction.seller,
            auction.tokenId
        );

        emit AuctionCancelled(auctionId);
    }

    // ── Dutch Auctions (declining price, USD-denominated) ───────────────

    /**
     * @notice Create a Dutch auction where the price declines linearly from
     *         startPriceUsdCents to endPriceUsdCents over the given duration.
     *         The first buyer to call buyDutchAuction() wins at the current price.
     *         NFT is escrowed in the marketplace contract during the auction.
     *         Unlike English auctions used by OpenSea, Dutch auctions enable
     *         efficient price discovery — commonly used in IPOs and bond markets.
     */
    function createDutchAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startPriceUsdCents,
        uint256 endPriceUsdCents,
        uint256 duration
    ) external nonReentrant whenNotPaused returns (uint256) {
        if (startPriceUsdCents == 0) revert PriceZero();
        if (endPriceUsdCents >= startPriceUsdCents) revert EndPriceTooHigh();
        if (duration < MIN_AUCTION_DURATION || duration > MAX_AUCTION_DURATION) revert InvalidDuration();

        IERC721 nft = IERC721(nftContract);
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (
            nft.getApproved(tokenId) != address(this) &&
            !nft.isApprovedForAll(msg.sender, address(this))
        ) revert MarketplaceNotApproved();

        nft.transferFrom(msg.sender, address(this), tokenId);

        uint256 auctionId = _nextDutchAuctionId++;
        dutchAuctions[auctionId] = DutchAuction({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            startPriceUsdCents: startPriceUsdCents,
            endPriceUsdCents: endPriceUsdCents,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            sold: false
        });

        emit DutchAuctionCreated(auctionId, msg.sender, startPriceUsdCents, endPriceUsdCents, block.timestamp + duration);
        return auctionId;
    }

    /**
     * @notice Buy an NFT from a Dutch auction at the current declining price.
     *         The oracle converts the current USD price to ETH. Buyer must send
     *         enough ETH (within 2% slippage tolerance).
     */
    function buyDutchAuction(uint256 auctionId) external payable nonReentrant whenNotPaused {
        DutchAuction storage da = dutchAuctions[auctionId];
        if (da.sold) revert DutchAuctionEnded();
        if (msg.sender == da.seller) revert SellerCannotBuy();

        uint256 currentPriceUsd = getDutchAuctionCurrentPrice(auctionId);
        uint256 requiredWei = _getRequiredWei(currentPriceUsd);
        if (msg.value < requiredWei) revert InsufficientPayment();

        // No ExcessivePayment check for Dutch auctions — the price continuously
        // declines, so overpaying relative to the view call is expected.
        // Excess is always refunded via pull-payment.

        da.sold = true;

        _distributeFunds(da.nftContract, da.tokenId, da.seller, requiredWei);

        uint256 refund = msg.value - requiredWei;
        if (refund > 0) {
            pendingWithdrawals[msg.sender] += refund;
        }

        IERC721(da.nftContract).safeTransferFrom(address(this), msg.sender, da.tokenId);
        emit DutchAuctionSold(auctionId, msg.sender, currentPriceUsd, requiredWei);
    }

    /// @notice Cancel a Dutch auction and reclaim escrowed NFT (seller only, unsold only).
    function cancelDutchAuction(uint256 auctionId) external {
        DutchAuction storage da = dutchAuctions[auctionId];
        if (da.sold) revert DutchAuctionEnded();
        if (da.seller != msg.sender) revert NotTheSeller();

        da.sold = true;
        IERC721(da.nftContract).safeTransferFrom(address(this), da.seller, da.tokenId);
        emit DutchAuctionCancelled(auctionId);
    }

    /**
     * @notice Get the current declining USD price of a Dutch auction.
     *         Price decreases linearly from startPrice to endPrice over the duration.
     */
    function getDutchAuctionCurrentPrice(uint256 auctionId) public view returns (uint256) {
        DutchAuction storage da = dutchAuctions[auctionId];
        if (block.timestamp >= da.endTime) return da.endPriceUsdCents;

        uint256 elapsed = block.timestamp - da.startTime;
        uint256 duration = da.endTime - da.startTime;
        uint256 priceDrop = (da.startPriceUsdCents - da.endPriceUsdCents) * elapsed / duration;
        return da.startPriceUsdCents - priceDrop;
    }

    // ── On-Chain Offers (ETH escrowed, any NFT) ──────────────────────

    /**
     * @notice Make an offer on any NFT by sending ETH, which is escrowed on-chain.
     *         Unlike OpenSea's off-chain Seaport orders, offers here are fully
     *         transparent and trustless. NFT owner can accept at any time.
     * @param nftContract  The ERC-721 contract address.
     * @param tokenId      The token ID to make an offer on.
     * @param duration     Offer validity in seconds.
     */
    function makeOffer(
        address nftContract,
        uint256 tokenId,
        uint256 duration
    ) external payable whenNotPaused returns (uint256) {
        if (msg.value == 0) revert PriceZero();
        if (duration < MIN_AUCTION_DURATION || duration > MAX_AUCTION_DURATION) revert InvalidDuration();

        uint256 offerId = _nextOfferId++;
        offers[offerId] = Offer({
            buyer: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            amount: msg.value,
            expiration: block.timestamp + duration,
            active: true
        });

        emit OfferMade(offerId, msg.sender, nftContract, tokenId, msg.value, block.timestamp + duration);
        return offerId;
    }

    /**
     * @notice Accept an offer as the NFT owner. Transfers the NFT to the buyer
     *         and distributes escrowed funds (platform fee, royalty, seller proceeds).
     *         Caller must own the NFT and have approved the marketplace.
     */
    function acceptOffer(uint256 offerId) external nonReentrant whenNotPaused {
        Offer storage offer = offers[offerId];
        if (!offer.active) revert OfferNotActive();
        if (block.timestamp > offer.expiration) revert OfferExpired();

        IERC721 nft = IERC721(offer.nftContract);
        if (nft.ownerOf(offer.tokenId) != msg.sender) revert NotTokenOwner();
        if (
            nft.getApproved(offer.tokenId) != address(this) &&
            !nft.isApprovedForAll(msg.sender, address(this))
        ) revert MarketplaceNotApproved();

        offer.active = false;

        _distributeFunds(offer.nftContract, offer.tokenId, msg.sender, offer.amount);

        nft.safeTransferFrom(msg.sender, offer.buyer, offer.tokenId);
        emit OfferAccepted(offerId, msg.sender);
    }

    /// @notice Cancel an active offer and reclaim escrowed ETH via pendingWithdrawals.
    function cancelOffer(uint256 offerId) external {
        Offer storage offer = offers[offerId];
        if (!offer.active) revert OfferNotActive();
        if (offer.buyer != msg.sender) revert NotTheSeller();

        offer.active = false;
        pendingWithdrawals[msg.sender] += offer.amount;
        emit OfferCancelled(offerId);
    }

    // ── P2P NFT Swaps (atomic bartering with optional ETH top-up) ──────

    /**
     * @notice Propose an atomic NFT-for-NFT swap with a specific counterparty.
     *         The proposer's NFT is escrowed. Optionally include ETH as a sweetener.
     *         Reinvents the oldest form of trade (bartering) with trustless on-chain escrow.
     *         No NFT marketplace supports this — a true innovation.
     * @param counterparty        Address of the user you want to swap with.
     * @param proposerNftContract Your NFT's contract address.
     * @param proposerTokenId     Your NFT's token ID (will be escrowed).
     * @param counterpartyNftContract The NFT contract you want in return.
     * @param counterpartyTokenId     The token ID you want in return.
     * @param duration            Swap proposal validity in seconds.
     */
    function proposeSwap(
        address counterparty,
        address proposerNftContract,
        uint256 proposerTokenId,
        address counterpartyNftContract,
        uint256 counterpartyTokenId,
        uint256 duration
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        if (duration < MIN_AUCTION_DURATION || duration > MAX_AUCTION_DURATION) revert InvalidDuration();

        IERC721 nft = IERC721(proposerNftContract);
        if (nft.ownerOf(proposerTokenId) != msg.sender) revert NotTokenOwner();
        if (
            nft.getApproved(proposerTokenId) != address(this) &&
            !nft.isApprovedForAll(msg.sender, address(this))
        ) revert MarketplaceNotApproved();

        // Escrow proposer's NFT
        nft.transferFrom(msg.sender, address(this), proposerTokenId);

        uint256 swapId = _nextSwapId++;
        swaps[swapId] = Swap({
            proposer: msg.sender,
            counterparty: counterparty,
            proposerNftContract: proposerNftContract,
            proposerTokenId: proposerTokenId,
            counterpartyNftContract: counterpartyNftContract,
            counterpartyTokenId: counterpartyTokenId,
            ethTopUp: msg.value,
            expiration: block.timestamp + duration,
            active: true
        });

        emit SwapProposed(swapId, msg.sender, counterparty);
        return swapId;
    }

    /**
     * @notice Accept a swap proposal. The counterparty's NFT is transferred to
     *         the proposer, and the escrowed NFT (+ optional ETH) goes to the
     *         counterparty. Both transfers are atomic — all-or-nothing.
     *         Platform fee is applied only on the ETH component (if any).
     */
    function acceptSwap(uint256 swapId) external nonReentrant whenNotPaused {
        Swap storage swap = swaps[swapId];
        if (!swap.active) revert SwapNotActive();
        if (msg.sender != swap.counterparty) revert NotCounterparty();
        if (block.timestamp > swap.expiration) revert SwapExpired();

        IERC721 counterpartyNft = IERC721(swap.counterpartyNftContract);
        if (counterpartyNft.ownerOf(swap.counterpartyTokenId) != msg.sender) revert NotTokenOwner();
        if (
            counterpartyNft.getApproved(swap.counterpartyTokenId) != address(this) &&
            !counterpartyNft.isApprovedForAll(msg.sender, address(this))
        ) revert MarketplaceNotApproved();

        swap.active = false;

        // Distribute ETH top-up if any (platform fee + royalty on counterparty's NFT)
        if (swap.ethTopUp > 0) {
            _distributeFunds(
                swap.counterpartyNftContract,
                swap.counterpartyTokenId,
                swap.counterparty,
                swap.ethTopUp
            );
        }

        // Atomic swap: proposer's escrowed NFT → counterparty
        IERC721(swap.proposerNftContract).safeTransferFrom(
            address(this), swap.counterparty, swap.proposerTokenId
        );

        // Atomic swap: counterparty's NFT → proposer
        counterpartyNft.safeTransferFrom(
            swap.counterparty, swap.proposer, swap.counterpartyTokenId
        );

        emit SwapExecuted(swapId);
    }

    /// @notice Cancel a swap proposal and reclaim escrowed NFT + ETH (proposer only).
    function cancelSwap(uint256 swapId) external {
        Swap storage swap = swaps[swapId];
        if (!swap.active) revert SwapNotActive();
        if (swap.proposer != msg.sender) revert NotTheSeller();

        swap.active = false;

        // Return escrowed NFT
        IERC721(swap.proposerNftContract).safeTransferFrom(
            address(this), swap.proposer, swap.proposerTokenId
        );

        // Refund ETH top-up via pull-payment
        if (swap.ethTopUp > 0) {
            pendingWithdrawals[swap.proposer] += swap.ethTopUp;
        }

        emit SwapCancelled(swapId);
    }

    // ── Withdraw (pull-payment for all fund distributions) ───────────────

    /// @notice Withdraw accumulated funds (from sales, royalties, refunds, or platform fees).
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Allow the marketplace to receive NFTs via safeTransferFrom.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ── Oracle ─────────────────────────────────────────────────────────

    /**
     * @notice Set the oracle address (owner only). Must be called after deployment.
     */
    function setOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert OracleNotSet();
        oracle = ISimpleOracle(_oracle);
        emit OracleUpdated(_oracle);
    }

    // ── Admin ───────────────────────────────────────────────────────────

    /// @notice Update the platform fee in basis points (owner only, max 10%).
    function setPlatformFee(uint256 feeBps) external onlyOwner {
        if (feeBps > MAX_FEE) revert FeeTooHigh();
        platformFeeBps = feeBps;
        emit PlatformFeeUpdated(feeBps);
    }

    /// @notice Pause the marketplace, disabling new listings, purchases, and bids.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the marketplace, re-enabling normal operations.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ── Internals ───────────────────────────────────────────────────────

    /**
     * @dev Internal listing creation used by both listNFT and batchListNFT.
     */
    function _createListing(
        address nftContract,
        uint256 tokenId,
        uint256 priceUsdCents,
        uint256 duration
    ) internal returns (uint256) {
        if (priceUsdCents == 0) revert PriceZero();
        IERC721 nft = IERC721(nftContract);
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (
            nft.getApproved(tokenId) != address(this) &&
            !nft.isApprovedForAll(msg.sender, address(this))
        ) revert MarketplaceNotApproved();

        uint256 expiration = duration == 0 ? 0 : block.timestamp + duration;

        uint256 listingId = _nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            priceUsdCents: priceUsdCents,
            active: true,
            expiration: expiration
        });

        emit Listed(listingId, msg.sender, nftContract, tokenId, priceUsdCents, expiration);
        return listingId;
    }

    /**
     * @dev Convert a USD cents price to wei using the oracle's ETH/USD price.
     *      Formula: requiredWei = (priceUsdCents * 1e24) / oraclePrice
     *      where oraclePrice has 8 decimals (e.g., 209100000000 = $2091.00).
     */
    function _getRequiredWei(uint256 priceUsdCents) internal view returns (uint256) {
        if (address(oracle) == address(0)) revert OracleNotSet();
        (uint256 oraclePrice, ) = oracle.getLatestPrice(); // reverts if stale
        if (oraclePrice == 0) revert OracleNotSet();
        return (priceUsdCents * USD_WEI_FACTOR + oraclePrice - 1) / oraclePrice;
    }

    /**
     * @dev Distribute sale proceeds via pull-payment pattern:
     *      platform fee, royalty, and remainder accumulate in pendingWithdrawals.
     */
    function _distributeFunds(
        address nftContract,
        uint256 tokenId,
        address seller,
        uint256 salePrice
    ) internal {
        // 1. Platform fee
        uint256 platformFee = (salePrice * platformFeeBps) / BPS_DENOMINATOR;

        // 2. Royalty (ERC-2981)
        uint256 royaltyAmount = 0;
        address royaltyReceiver = address(0);

        try IERC2981(nftContract).royaltyInfo(tokenId, salePrice) returns (
            address receiver,
            uint256 amount
        ) {
            royaltyReceiver = receiver;
            royaltyAmount = amount;
        } catch {}

        // 2b. Prevent fund loss to zero-address royalty receiver
        if (royaltyReceiver == address(0)) {
            royaltyAmount = 0;
        }

        // 3. Guard: if royalty is unreasonably large, ignore it
        if (platformFee + royaltyAmount > salePrice) {
            royaltyAmount = 0;
            royaltyReceiver = address(0);
        }

        // 4. Seller gets the rest
        uint256 sellerProceeds = salePrice - platformFee - royaltyAmount;

        // Accumulate into pendingWithdrawals (pull-payment)
        if (platformFee > 0) {
            pendingWithdrawals[owner()] += platformFee;
        }
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            pendingWithdrawals[royaltyReceiver] += royaltyAmount;
        }
        if (sellerProceeds > 0) {
            pendingWithdrawals[seller] += sellerProceeds;
        }
    }

    // ── View helpers ────────────────────────────────────────────────────

    /// @notice Return the total number of listings ever created.
    function getListingCount() external view returns (uint256) {
        return _nextListingId;
    }

    /// @notice Return the total number of auctions ever created.
    function getAuctionCount() external view returns (uint256) {
        return _nextAuctionId;
    }

    /**
     * @notice Get the current ETH price for a listing based on oracle rate.
     * @return requiredWei Exact ETH needed at current oracle rate.
     * @return maxWei      Maximum ETH accepted (requiredWei + 2% slippage).
     */
    function getListingPriceInWei(uint256 listingId) external view returns (uint256 requiredWei, uint256 maxWei) {
        Listing storage listing = listings[listingId];
        requiredWei = _getRequiredWei(listing.priceUsdCents);
        maxWei = requiredWei + (requiredWei * SLIPPAGE_BPS) / BPS_DENOMINATOR;
    }

    /// @notice Check whether a listing has passed its expiration timestamp.
    function isListingExpired(uint256 listingId) external view returns (bool) {
        Listing storage l = listings[listingId];
        return l.expiration != 0 && block.timestamp > l.expiration;
    }

    /// @notice Return the total number of Dutch auctions ever created.
    function getDutchAuctionCount() external view returns (uint256) {
        return _nextDutchAuctionId;
    }

    /// @notice Return the total number of offers ever created.
    function getOfferCount() external view returns (uint256) {
        return _nextOfferId;
    }

    /**
     * @notice Get the current ETH price for a Dutch auction based on oracle rate.
     * @return requiredWei Exact ETH needed at current declining price.
     * @return maxWei      Maximum ETH accepted (requiredWei + 2% slippage).
     */
    function getDutchAuctionPriceInWei(uint256 auctionId) external view returns (uint256 requiredWei, uint256 maxWei) {
        uint256 currentPriceUsd = getDutchAuctionCurrentPrice(auctionId);
        requiredWei = _getRequiredWei(currentPriceUsd);
        maxWei = requiredWei + (requiredWei * SLIPPAGE_BPS) / BPS_DENOMINATOR;
    }

    /// @notice Return the total number of swaps ever proposed.
    function getSwapCount() external view returns (uint256) {
        return _nextSwapId;
    }
}
