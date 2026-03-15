# NFT Marketplace — Business Logic & Technical Implementation

**FT5003 Blockchain Innovations — NUS**

---

## 1. Business Model

### Revenue Model
- **Platform Fee**: 2.5% on every sale (configurable by contract owner, max 10%)
- **Creator Royalties**: 0–10% on secondary sales, enforced via ERC-2981

### User Roles

| Role | Actions |
|------|---------|
| **Creator** | Mint NFTs, set royalties, earn on resales |
| **Seller** | List NFTs (fixed price or auction), cancel listings |
| **Buyer** | Buy listed NFTs, place bids on auctions |
| **Platform Owner** | Set platform fee, withdraw accumulated fees |

---

## 2. Core Business Flows

### 2.1 Minting

**Business Rule**: Anyone with a connected wallet can mint an NFT.

1. User uploads image (stored on IPFS)
2. Frontend builds JSON metadata: `{ name, description, image: "ipfs://...", attributes }`
3. Metadata is uploaded to IPFS
4. Smart contract `mintNFT(to, tokenURI, royaltyFee)` is called
5. NFT is created with the caller as the royalty receiver

**Technical Details:**
- `tokenURI` points to IPFS JSON metadata
- `royaltyFee` is in basis points (500 = 5%)
- Token ID auto-increments from 0
- Gas cost: ~150,000 gas

### 2.2 Fixed-Price Listing

**Business Rule**: Only the NFT owner can list. Must approve marketplace first.

1. Seller approves marketplace contract for the token
2. Seller calls `listNFT(nftContract, tokenId, price)`
3. Listing is stored on-chain with `active = true`
4. NFT remains in seller's wallet (not escrowed)

**Why no escrow for listings?**
- Better UX: seller retains NFT until sold
- Seller can display the NFT in their wallet
- Marketplace checks ownership at buy time

### 2.3 Buying

**Business Rule**: Buyer sends exact listing price. Cannot buy own NFT.

1. Buyer calls `buyNFT(listingId)` with exact ETH amount
2. Contract distributes funds:
   - 2.5% → Platform owner
   - Royalty % → Original creator
   - Remainder → Seller
3. NFT is transferred from seller to buyer
4. Listing marked as inactive

**Fund Distribution Example** (1 ETH sale, 5% royalty):
```
Total:    1.000 ETH
Platform: 0.025 ETH (2.5%)
Royalty:  0.050 ETH (5.0%)
Seller:   0.925 ETH (92.5%)
```

### 2.4 English Auction

**Business Rule**: Auctions have a fixed duration (1 hour to 7 days). NFT is escrowed.

**Creating:**
1. Seller approves marketplace
2. Seller calls `createAuction(nft, tokenId, startPrice, duration)`
3. NFT is transferred to marketplace (escrow)
4. Countdown begins

**Bidding:**
1. Bidder sends ETH >= start price and > current highest bid
2. Previous highest bidder's funds added to `pendingWithdrawals`
3. New bid becomes the highest

**Ending:**
1. Anyone can call `endAuction()` after `endTime`
2. If bids exist: funds distributed (same as fixed-price), NFT to winner
3. If no bids: NFT returned to seller

**Withdrawal:**
- Outbid users call `withdraw()` to reclaim their ETH
- This is the "pull-over-push" pattern for safety

### 2.5 Cancellation

**Business Rule**: Only the seller can cancel an active listing. Auctions cannot be cancelled after creation (to protect bidders).

---

## 3. Smart Contract Implementation Details

### 3.1 Solidity Version & Standards

| Component | Standard/Version |
|-----------|-----------------|
| Solidity | 0.8.28 |
| EVM Target | Cancun |
| NFT Standard | ERC-721 (OpenZeppelin v5) |
| Royalty Standard | ERC-2981 |
| Enumeration | ERC-721 Enumerable |
| Access Control | Ownable |
| Security | ReentrancyGuard |

### 3.2 Gas Optimization

- `uint96` for royalty fees (packs with address in storage slot)
- Optimizer enabled with 200 runs
- `calldata` for string parameters (cheaper than `memory`)
- Events emitted for off-chain indexing (cheaper than storage)

### 3.3 Storage Layout

**NFTCollection:**
```
Slot 0-6: ERC721 base storage
Slot 7:   _nextTokenId (uint256)
Slot 8+:  ERC2981 royalty mappings
```

**NFTMarketplace:**
```
Slot 0:   Ownable (_owner)
Slot 1:   platformFeeBps (uint256)
Slot 2:   _nextListingId (uint256)
Slot 3:   _nextAuctionId (uint256)
Slot 4:   listings mapping
Slot 5:   auctions mapping
Slot 6:   pendingWithdrawals mapping
```

---

## 4. Frontend Technical Implementation

### 4.1 Profile Page

The Profile page serves as the user's dashboard:
- **Banner + Avatar**: Gradient banner with overlapping avatar circle and truncated wallet address
- **Stats**: Owned count, Created count, ETH balance, Total volume
- **4 Tabs**:
  - **Collected**: Grid of owned NFTs, each with a "List for Sale" button
  - **Created**: Grid of NFTs minted by the user
  - **Favorited**: Grid of favorited NFTs
  - **Activity**: User's transaction history (mints, listings, sales)
- **List for Sale Modal**: Price input (ETH), listing type toggle (Fixed Price / Auction), and confirmation flow triggering the TransactionModal

### 4.2 Wallet Integration

- **RainbowKit** provides a modal for connecting wallets (MetaMask, WalletConnect, Coinbase Wallet)
- **wagmi** manages connection state, chain switching, and transaction tracking
- Supports Hardhat local network (chainId 31337) and Sepolia testnet (chainId 11155111)

### 4.3 Contract Interaction Pattern

All contract interactions follow this pattern:

```
useWriteContract → User signs in wallet → useWaitForTransactionReceipt → UI update
```

Custom hooks encapsulate this:
- `useMintNFT()` → returns `{ mint, isPending, isConfirming, isSuccess }`
- `useBuyNFT()` → returns `{ buy, isPending, isConfirming, isSuccess }`
- etc.

### 4.4 IPFS Integration

- **Upload flow**: File → Pinata API → IPFS hash → metadata JSON → Pinata API → IPFS hash
- **Fallback**: Without Pinata JWT, images stored as base64 data URIs (demo mode)
- **Resolution**: `ipfs://` URIs resolved via Pinata gateway for display

### 4.5 State Management

- **Server state** (blockchain data): Managed by wagmi's React Query integration with automatic refetching
- **UI state** (filters, tabs, forms): React useState
- **No global state store needed**: wagmi handles caching and deduplication

---

## 5. Testing Strategy

### 5.1 Smart Contract Tests (28 tests)

**NFTCollection (8 tests):**
- Minting with correct URI and royalty
- Royalty info calculation
- Royalty fee cap enforcement
- Token ID incrementing
- Cross-address minting
- Token enumeration
- Interface support (ERC-165, ERC-721, ERC-2981)
- Creator lookup

**NFTMarketplace (17 tests):**
- Listing creation and validation
- Approval checks
- Price validation
- Buy flow with fund distribution verification
- Payment validation
- Self-purchase prevention
- Listing cancellation
- Auction creation with escrow
- Bid placement and validation
- Outbid refund via pendingWithdrawals
- Auction settlement (with/without bids)
- Auction timing enforcement
- Self-bid prevention

**Admin (3 tests):**
- Fee update by owner
- Fee cap enforcement
- Non-owner rejection

### 5.2 Test Coverage Areas

- Happy paths (normal operations)
- Authorization (only owner, only seller, etc.)
- Edge cases (zero price, self-purchase, expired auction)
- Security (reentrancy protection, fund distribution accuracy)
- Numerical precision (ETH amounts, basis points)

---

## 6. Deployment Guide

### Local Development
```bash
# Terminal 1: Start local blockchain
cd contracts && npx hardhat node

# Terminal 2: Deploy contracts
cd contracts && npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: Start frontend
cd frontend && npm run dev
```

### Sepolia Testnet
```bash
# Set environment variables
export SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
export PRIVATE_KEY="your-private-key"

# Deploy
cd contracts && npx hardhat run scripts/deploy.js --network sepolia
```

The deploy script automatically:
1. Deploys both contracts
2. Writes addresses to `frontend/src/config/deployed-addresses.json`
3. Copies ABIs to `frontend/src/config/abis/`

---

## 7. Frontend Feature Implementation

### 7.1 Collection Concept

The marketplace distinguishes between **Collections** (groups of thematically related NFTs) and individual **Items** (NFTs). Each collection has:
- Name, description, and banner gradient
- Aggregate stats: total supply, unique owners, floor price, total volume, 24h change
- Dedicated page at `/collection/:slug` showing all items in the collection

The Home page Trending section displays top collections (not individual NFTs), linking to their dedicated pages. This mirrors real-world marketplace conventions (OpenSea, Blur).

### 7.2 Make Offer System

Users can make WETH (Wrapped ETH) offers on any NFT, even if not currently listed:
- **WETH** is used instead of ETH because offers require pre-approved token spending
- Offer modal includes amount input and expiration dropdown (1 day, 3 days, 7 days, 30 days)
- Offers tab on NFT detail page displays all active offers with bidder addresses, amounts, and expiry times
- Submitting an offer triggers the TransactionModal flow

### 7.3 Web3 Transaction States

All blockchain-interacting actions (Buy, Bid, List, Mint, Make Offer) show a 3-stage modal:
1. **Wallet Approval** — Simulates waiting for the user to confirm in their wallet
2. **Blockchain Pending** — Shows progress bar and mock transaction hash
3. **Success** — Green checkmark animation with auto-dismiss

This provides realistic UX feedback matching production dApp behavior.

### 7.4 NFT Traits / Attributes

The Create page supports adding custom key-value attributes (e.g., Background: Nebula, Palette: Cosmic). Traits:
- Follow the OpenSea metadata standard (`attributes` array in JSON metadata)
- Display as tag-like chips on NFT detail pages
- Appear in the live preview card during creation

### 7.5 IPFS / Decentralized Storage

- Create page shows helper text: "Assets will be securely stored on IPFS (InterPlanetary File System)"
- NFT detail pages show the IPFS hash with an external link to `ipfs.io` in the Details tab
- Demonstrates understanding of content-addressed, decentralized storage

### 7.6 Centralized Mock Data Architecture

All pages consume data from `src/data/mockData.js` instead of inline constants:
- **5 Collections**: Cosmic Dreamers, Neon Horizons, Abstract Realms, Digital Flora, Pixel Galaxy
- **22 NFTs**: Distributed across collections, each with real images (picsum.photos), attributes, offers, and activity history
- **Helper functions**: `getNFTById()`, `getCollectionBySlug()`, `getNFTsByCollection()`, `getFeaturedNFTs()`, `getTrendingCollections()`
- **User profile**: Mock wallet address, ETH balance, owned/created/favorited NFT lists

---

## 8. UI/UX Polish (Round 3)

### 8.1 Interaction Fixes
- **Activity page**: NFT name text color adjusted from overwhelming purple to balanced light-gray with hover-to-purple transition
- **Transaction messages**: Removed "(mock)" labels from success toast notifications for production-ready appearance
- **Share / External Link buttons**: Now functional — Share copies page URL to clipboard with toast confirmation; External Link opens IPFS gateway
- **Network Switcher**: Replaced RainbowKit's built-in chain switcher with custom dropdown using wagmi's `useSwitchChain` for reliable Hardhat ↔ Sepolia switching
- **Disconnect Wallet**: Added explicit disconnect button in custom user menu dropdown using wagmi's `useDisconnect`

### 8.2 UI Enhancements
- **Royalty Fee Slider**: Premium custom slider with gradient-filled track, floating tooltip bubble showing current value, tick marks at 0%/2.5%/5%/7.5%/10%, and glow effects
- **Trending Collections**: Gold/Silver/Bronze rank badges for top 3, hover glow with scale animation, colored change arrows (green ↑ / red ↓), glowing collection avatars, and "View All Collections" CTA button
- **Brand Update**: "NUS NFT" renamed to "NFT" across Navbar, Footer, page titles, and config

### 8.3 Footer
- 4-column layout: Brand, Marketplace, Resources, Community
- Copyright updated: "© 2026 NFT Marketplace. Built for FT5003 Group 6 Blockchain Innovations."
- Tech stack attribution: "Built with React, Solidity & IPFS"

---

## 9. Future Enhancements

- **Lazy minting**: Mint at purchase time to save gas
- **The Graph indexing**: Event-based indexing for faster queries
- **IPFS pinning service**: Ensure metadata persistence via Pinata integration
- **Multi-chain support**: Deploy on Polygon, Arbitrum for lower fees
- **Collection creation UI**: Allow users to create and manage their own collections
- **Advanced search**: Full-text search, trait-based filtering, price range queries
- **Watchlist / Favorites**: Persistent favorites synced with wallet address
