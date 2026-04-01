// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

/**
 * @title IERC4907
 * @notice ERC-4907: Rental NFT — an extension of ERC-721 that adds a
 *         time-limited "user" role separate from "owner". The user has
 *         usage rights that expire automatically. OpenSea does not support this.
 */
interface IERC4907 {
    event UpdateUser(uint256 indexed tokenId, address indexed user, uint64 expires);
    function setUser(uint256 tokenId, address user, uint64 expires) external;
    function userOf(uint256 tokenId) external view returns (address);
    function userExpires(uint256 tokenId) external view returns (uint256);
}

/**
 * @title NFTCollection
 * @notice ERC-721 NFT with metadata, enumeration, ERC-2981 royalties,
 *         ERC-4907 rental (time-limited user role), and collaborative minting
 *         (multi-creator NFTs with automatic royalty splitting).
 */
contract NFTCollection is ERC721, ERC721URIStorage, ERC721Enumerable, ERC2981, IERC4907 {

    // ── Custom Errors ────────────────────────────────────────────────────

    error RoyaltyFeeTooHigh();
    error NotOwnerOrApproved();
    error EmptyCreators();
    error SharesLengthMismatch();
    error InvalidSharesTotal();
    error NoRoyaltyToDistribute();
    error CreatorTransferFailed();

    // ── Types ───────────────────────────────────────────────────────────

    struct UserInfo {
        address user;
        uint64 expires;
    }

    struct CollabInfo {
        address[] creators;
        uint256[] sharesBps;   // Must sum to 10000
    }

    // ── State ───────────────────────────────────────────────────────────

    uint256 private _nextTokenId = 1;
    uint96 public constant MAX_ROYALTY_FEE = 1000; // 10 %

    mapping(uint256 => UserInfo) private _users;
    mapping(uint256 => CollabInfo) private _collabInfo;
    mapping(uint256 => bool) public isCollaborative;

    // Pull-payment for collaborative royalty distribution
    mapping(address => uint256) public pendingCreatorPayments;

    // ── Events ──────────────────────────────────────────────────────────

    event NFTMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string tokenURI,
        uint96 royaltyFee
    );

    event CollaborativeMinted(
        uint256 indexed tokenId,
        address[] creators,
        uint256[] sharesBps,
        uint96 royaltyFee
    );

    event RoyaltyDistributed(uint256 indexed tokenId, uint256 amount);
    event CreatorPaymentWithdrawn(address indexed creator, uint256 amount);

    // ── Constructor ─────────────────────────────────────────────────────

    constructor() ERC721("NUS NFT Collection", "NUSNFT") {}

    // ── Standard Minting ────────────────────────────────────────────────

    /**
     * @notice Mint a new NFT with metadata URI and royalty info.
     */
    function mintNFT(
        address to,
        string calldata uri,
        uint96 royaltyFee
    ) external returns (uint256) {
        if (royaltyFee > MAX_ROYALTY_FEE) revert RoyaltyFeeTooHigh();

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        _setTokenRoyalty(tokenId, msg.sender, royaltyFee);

        emit NFTMinted(tokenId, msg.sender, uri, royaltyFee);
        return tokenId;
    }

    // ── Collaborative Minting ───────────────────────────────────────────

    /**
     * @notice Mint an NFT co-created by multiple artists. Each creator's share
     *         (in basis points) is stored on-chain. When royalties are distributed,
     *         each creator receives their proportional share automatically.
     *         Solves the "team split" problem that plagues creative collaborations.
     *
     * @param to          Recipient of the minted NFT.
     * @param uri         IPFS metadata URI.
     * @param royaltyFee  Total royalty in basis points (max 1000 = 10%).
     * @param creators    Array of creator addresses.
     * @param sharesBps   Array of shares in basis points (must sum to exactly 10000).
     */
    function collaborativeMint(
        address to,
        string calldata uri,
        uint96 royaltyFee,
        address[] calldata creators,
        uint256[] calldata sharesBps
    ) external returns (uint256) {
        if (royaltyFee > MAX_ROYALTY_FEE) revert RoyaltyFeeTooHigh();
        if (creators.length == 0) revert EmptyCreators();
        if (creators.length != sharesBps.length) revert SharesLengthMismatch();

        uint256 totalShares = 0;
        for (uint256 i = 0; i < sharesBps.length; i++) {
            totalShares += sharesBps[i];
        }
        if (totalShares != 10_000) revert InvalidSharesTotal();

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        // Royalty receiver = this contract (will be split among creators)
        _setTokenRoyalty(tokenId, address(this), royaltyFee);

        // Store collaboration info
        _collabInfo[tokenId] = CollabInfo({
            creators: creators,
            sharesBps: sharesBps
        });
        isCollaborative[tokenId] = true;

        emit CollaborativeMinted(tokenId, creators, sharesBps, royaltyFee);
        return tokenId;
    }

    /**
     * @notice Distribute royalty ETH to all creators of a collaborative NFT.
     *         Called by the marketplace when a collaborative NFT generates royalties.
     *         Uses pull-payment: funds are credited to each creator's pending balance.
     */
    function distributeRoyalty(uint256 tokenId) external payable {
        if (msg.value == 0) revert NoRoyaltyToDistribute();
        CollabInfo storage info = _collabInfo[tokenId];
        if (info.creators.length == 0) revert NoRoyaltyToDistribute();

        for (uint256 i = 0; i < info.creators.length; i++) {
            uint256 share = (msg.value * info.sharesBps[i]) / 10_000;
            if (share > 0) {
                pendingCreatorPayments[info.creators[i]] += share;
            }
        }

        emit RoyaltyDistributed(tokenId, msg.value);
    }

    /**
     * @notice Creators withdraw their accumulated royalty payments.
     */
    function withdrawCreatorPayment() external {
        uint256 amount = pendingCreatorPayments[msg.sender];
        if (amount == 0) revert NoRoyaltyToDistribute();
        pendingCreatorPayments[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert CreatorTransferFailed();
        emit CreatorPaymentWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Get the collaboration info for a token.
     */
    function getCollabInfo(uint256 tokenId) external view returns (address[] memory creators, uint256[] memory sharesBps) {
        CollabInfo storage info = _collabInfo[tokenId];
        return (info.creators, info.sharesBps);
    }

    /**
     * @notice Get the creator (royalty receiver) for a token.
     */
    function getCreator(uint256 tokenId) external view returns (address) {
        (address receiver, ) = royaltyInfo(tokenId, 0);
        return receiver;
    }

    // ── ERC-4907: Rental (Time-Limited User Role) ───────────────────────

    /**
     * @notice Set the "user" of an NFT — a time-limited role with usage rights
     *         but no ownership. Only the owner or approved operator can call this.
     *         The user role expires automatically at the given timestamp.
     *         Key innovation: NFT stays in owner's wallet (no escrow needed).
     */
    function setUser(uint256 tokenId, address user, uint64 expires) external override {
        address tokenOwner = ownerOf(tokenId);
        if (
            msg.sender != tokenOwner &&
            getApproved(tokenId) != msg.sender &&
            !isApprovedForAll(tokenOwner, msg.sender)
        ) revert NotOwnerOrApproved();

        _users[tokenId] = UserInfo(user, expires);
        emit UpdateUser(tokenId, user, expires);
    }

    /**
     * @notice Get the current user of an NFT. Returns address(0) if expired or unset.
     */
    function userOf(uint256 tokenId) external view override returns (address) {
        if (uint256(_users[tokenId].expires) >= block.timestamp) {
            return _users[tokenId].user;
        }
        return address(0);
    }

    /**
     * @notice Get the expiry timestamp of the current user role.
     */
    function userExpires(uint256 tokenId) external view override returns (uint256) {
        return _users[tokenId].expires;
    }

    // ── Required Overrides ──────────────────────────────────────────────

    /**
     * @dev On transfer, automatically clear user info (rental expires on transfer).
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        address from = super._update(to, tokenId, auth);

        // Clear user info on transfer (ERC-4907 standard behavior)
        if (from != to && _users[tokenId].user != address(0)) {
            delete _users[tokenId];
            emit UpdateUser(tokenId, address(0), 0);
        }

        return from;
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721URIStorage, ERC721Enumerable, ERC2981) returns (bool) {
        return
            interfaceId == type(IERC4907).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @notice Allow this contract to receive ETH (for collaborative royalties via marketplace withdraw).
    receive() external payable {}
}
