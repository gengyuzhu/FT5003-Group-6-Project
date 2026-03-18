// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

/**
 * @title NFTCollection
 * @notice ERC-721 NFT contract with metadata storage, enumeration, and ERC-2981 royalties.
 *         Anyone can mint. The creator sets a per-token royalty fee (basis points).
 */
contract NFTCollection is ERC721, ERC721URIStorage, ERC721Enumerable, ERC2981 {

    error RoyaltyFeeTooHigh();

    uint256 private _nextTokenId = 1;

    uint96 public constant MAX_ROYALTY_FEE = 1000; // 10 %

    event NFTMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string tokenURI,
        uint96 royaltyFee
    );

    constructor() ERC721("NUS NFT Collection", "NUSNFT") {}

    /**
     * @notice Mint a new NFT with metadata URI and royalty info.
     * @param to        Recipient address.
     * @param uri       IPFS metadata URI (e.g. ipfs://Qm...).
     * @param royaltyFee Royalty in basis points (max 1000 = 10 %).
     * @return tokenId  The newly minted token ID.
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

        // Set per-token royalty (receiver = creator)
        _setTokenRoyalty(tokenId, msg.sender, royaltyFee);

        emit NFTMinted(tokenId, msg.sender, uri, royaltyFee);
        return tokenId;
    }

    /**
     * @notice Get the creator (royalty receiver) for a token.
     */
    function getCreator(uint256 tokenId) external view returns (address) {
        (address receiver, ) = royaltyInfo(tokenId, 0);
        return receiver;
    }

    // ── Required overrides ──────────────────────────────────────────────

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
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
        return super.supportsInterface(interfaceId);
    }
}
