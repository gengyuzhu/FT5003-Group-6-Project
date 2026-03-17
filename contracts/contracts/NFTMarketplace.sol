// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NFTMarketplace
 * @notice Decentralized NFT marketplace supporting fixed-price listings and
 *         English auctions with ERC-2981 royalty enforcement, a platform fee,
 *         pull-payment fund distribution, listing expiration, and minimum bid increments.
 */
contract NFTMarketplace is Ownable, ReentrancyGuard, Pausable {

    // ── Custom Errors ────────────────────────────────────────────────────

    error PriceZero();
    error NotTokenOwner();
    error MarketplaceNotApproved();
    error ListingNotActive();
    error ListingExpiredError();
    error IncorrectPrice();
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

    // ── Types ───────────────────────────────────────────────────────────

    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;       // in wei
        bool active;
        uint256 expiration;  // 0 = no expiry, otherwise unix timestamp
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

    // ── State ───────────────────────────────────────────────────────────

    uint256 public platformFeeBps = 250;   // 2.5 %
    uint256 public constant MAX_FEE = 1000; // 10 %
    uint256 public constant MIN_BID_INCREMENT_BPS = 500; // 5 % minimum bid increase

    uint256 private _nextListingId;
    uint256 private _nextAuctionId;

    mapping(uint256 => Listing)  public listings;
    mapping(uint256 => Auction)  public auctions;

    // Pending withdrawals (pull-payment for all fund distributions)
    mapping(address => uint256)  public pendingWithdrawals;

    // ── Events ──────────────────────────────────────────────────────────

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address nftContract,
        uint256 tokenId,
        uint256 price,
        uint256 expiration
    );

    event Sold(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 price
    );

    event ListingCancelled(uint256 indexed listingId);

    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address nftContract,
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
     * @notice List an NFT for a fixed price with optional expiration.
     * @param nftContract Address of the ERC-721 contract.
     * @param tokenId     Token ID to list.
     * @param price       Sale price in wei.
     * @param duration    Listing duration in seconds (0 = no expiry).
     */
    function listNFT(
        address nftContract,
        uint256 tokenId,
        uint256 price,
        uint256 duration
    ) external whenNotPaused returns (uint256) {
        if (price == 0) revert PriceZero();
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
            price: price,
            active: true,
            expiration: expiration
        });

        emit Listed(listingId, msg.sender, nftContract, tokenId, price, expiration);
        return listingId;
    }

    /**
     * @notice Buy a listed NFT. Sends exact `listing.price` as msg.value.
     */
    function buyNFT(uint256 listingId) external payable nonReentrant whenNotPaused {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.expiration != 0 && block.timestamp > listing.expiration) revert ListingExpiredError();
        if (msg.value != listing.price) revert IncorrectPrice();
        if (msg.sender == listing.seller) revert SellerCannotBuy();

        listing.active = false;

        _distributeFunds(
            listing.nftContract,
            listing.tokenId,
            listing.seller,
            listing.price
        );

        IERC721(listing.nftContract).safeTransferFrom(
            listing.seller,
            msg.sender,
            listing.tokenId
        );

        emit Sold(listingId, msg.sender, listing.price);
    }

    /**
     * @notice Cancel an active listing (seller only).
     */
    function cancelListing(uint256 listingId) external whenNotPaused {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.seller != msg.sender) revert NotTheSeller();

        listing.active = false;
        emit ListingCancelled(listingId);
    }

    /**
     * @notice Update the price of an active listing (seller only).
     */
    function updateListingPrice(uint256 listingId, uint256 newPrice) external whenNotPaused {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.seller != msg.sender) revert NotTheSeller();
        if (newPrice == 0) revert PriceZero();

        uint256 oldPrice = listing.price;
        listing.price = newPrice;
        emit ListingPriceUpdated(listingId, oldPrice, newPrice);
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
    ) external whenNotPaused returns (uint256) {
        if (startPrice == 0) revert PriceZero();
        if (duration < 1 hours || duration > 7 days) revert InvalidDuration();

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
            uint256 minBid = auction.highestBid + (auction.highestBid * MIN_BID_INCREMENT_BPS) / 10_000;
            if (msg.value < minBid) revert BidIncrementTooLow();
        }

        // Refund previous highest bidder via pull pattern
        if (auction.highestBidder != address(0)) {
            pendingWithdrawals[auction.highestBidder] += auction.highestBid;
        }

        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

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

    /**
     * @notice Cancel an auction with no bids (seller only).
     *         Returns the escrowed NFT to the seller.
     */
    function cancelAuction(uint256 auctionId) external whenNotPaused {
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

    // ── Withdraw (pull-payment for all fund distributions) ───────────────

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ── Admin ───────────────────────────────────────────────────────────

    function setPlatformFee(uint256 feeBps) external onlyOwner {
        if (feeBps > MAX_FEE) revert FeeTooHigh();
        platformFeeBps = feeBps;
        emit PlatformFeeUpdated(feeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ── Internals ───────────────────────────────────────────────────────

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
        uint256 platformFee = (salePrice * platformFeeBps) / 10_000;

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

    function getListingCount() external view returns (uint256) {
        return _nextListingId;
    }

    function getAuctionCount() external view returns (uint256) {
        return _nextAuctionId;
    }

    function isListingExpired(uint256 listingId) external view returns (bool) {
        Listing storage l = listings[listingId];
        return l.expiration != 0 && block.timestamp > l.expiration;
    }
}
