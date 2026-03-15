// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NFTMarketplace
 * @notice Decentralized NFT marketplace supporting fixed-price listings and
 *         English auctions with ERC-2981 royalty enforcement and a platform fee.
 */
contract NFTMarketplace is Ownable, ReentrancyGuard {

    // ── Types ───────────────────────────────────────────────────────────

    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;       // in wei
        bool active;
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

    uint256 private _nextListingId;
    uint256 private _nextAuctionId;

    mapping(uint256 => Listing)  public listings;
    mapping(uint256 => Auction)  public auctions;

    // Pending withdrawals (for failed ETH transfers / outbid returns)
    mapping(address => uint256)  public pendingWithdrawals;

    // ── Events ──────────────────────────────────────────────────────────

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address nftContract,
        uint256 tokenId,
        uint256 price
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

    // ── Constructor ─────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ── Fixed-price listings ────────────────────────────────────────────

    /**
     * @notice List an NFT for a fixed price.
     *         Caller must have approved this contract for the token.
     */
    function listNFT(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) external returns (uint256) {
        require(price > 0, "Price must be > 0");
        IERC721 nft = IERC721(nftContract);
        require(nft.ownerOf(tokenId) == msg.sender, "Not the owner");
        require(
            nft.getApproved(tokenId) == address(this) ||
            nft.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        uint256 listingId = _nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            active: true
        });

        emit Listed(listingId, msg.sender, nftContract, tokenId, price);
        return listingId;
    }

    /**
     * @notice Buy a listed NFT. Sends exact `listing.price` as msg.value.
     */
    function buyNFT(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(msg.value == listing.price, "Incorrect price");
        require(msg.sender != listing.seller, "Seller cannot buy own NFT");

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
    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing not active");
        require(listing.seller == msg.sender, "Not the seller");

        listing.active = false;
        emit ListingCancelled(listingId);
    }

    // ── English auctions ────────────────────────────────────────────────

    /**
     * @notice Create an English auction for an NFT.
     * @param duration Auction duration in seconds.
     */
    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startPrice,
        uint256 duration
    ) external returns (uint256) {
        require(startPrice > 0, "Start price must be > 0");
        require(duration >= 1 hours && duration <= 7 days, "Invalid duration");

        IERC721 nft = IERC721(nftContract);
        require(nft.ownerOf(tokenId) == msg.sender, "Not the owner");
        require(
            nft.getApproved(tokenId) == address(this) ||
            nft.isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

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
     */
    function placeBid(uint256 auctionId) external payable nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(!auction.ended, "Auction ended");
        require(block.timestamp < auction.endTime, "Auction expired");
        require(msg.sender != auction.seller, "Seller cannot bid");
        require(
            msg.value >= auction.startPrice,
            "Bid below start price"
        );
        require(msg.value > auction.highestBid, "Bid too low");

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
        require(!auction.ended, "Already ended");
        require(block.timestamp >= auction.endTime, "Auction not yet expired");

        auction.ended = true;

        if (auction.highestBidder != address(0)) {
            // Distribute funds (platform fee + royalty + seller)
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

    // ── Withdraw (pull-payment for outbid refunds) ──────────────────────

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    // ── Admin ───────────────────────────────────────────────────────────

    function setPlatformFee(uint256 feeBps) external onlyOwner {
        require(feeBps <= MAX_FEE, "Fee too high");
        platformFeeBps = feeBps;
        emit PlatformFeeUpdated(feeBps);
    }

    // ── Internals ───────────────────────────────────────────────────────

    /**
     * @dev Distribute sale proceeds: platform fee, royalty, remainder to seller.
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

        // 3. Seller gets the rest
        uint256 sellerProceeds = salePrice - platformFee - royaltyAmount;

        // Transfer platform fee to owner
        if (platformFee > 0) {
            (bool ok1, ) = payable(owner()).call{value: platformFee}("");
            require(ok1, "Platform fee transfer failed");
        }

        // Transfer royalty
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            (bool ok2, ) = payable(royaltyReceiver).call{value: royaltyAmount}("");
            require(ok2, "Royalty transfer failed");
        }

        // Transfer to seller
        if (sellerProceeds > 0) {
            (bool ok3, ) = payable(seller).call{value: sellerProceeds}("");
            require(ok3, "Seller transfer failed");
        }
    }

    // ── View helpers ────────────────────────────────────────────────────

    function getListingCount() external view returns (uint256) {
        return _nextListingId;
    }

    function getAuctionCount() external view returns (uint256) {
        return _nextAuctionId;
    }
}
