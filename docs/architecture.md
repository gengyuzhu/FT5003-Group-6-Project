# NFT Marketplace — Architecture & Design Document

**FT5003 Blockchain Innovations — NUS**

---

## 1. System Overview

The NFT Marketplace is a decentralized application (dApp) that enables users to mint, list, buy, and auction ERC-721 NFTs on the Ethereum blockchain. The platform enforces ERC-2981 royalties on every secondary sale and charges a configurable platform fee.

### High-Level Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ RainbowKit│ │  wagmi   │  │  Framer  │  │ TailwindCSS  │  │
│  │ (Wallet) │  │ (Hooks)  │  │ Motion   │  │  (Styling)   │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────────┘  │
│       │              │                                         │
│       └──────┬───────┘                                         │
│              │                                                 │
└──────────────┼─────────────────────────────────────────────────┘
               │ JSON-RPC (via viem)
               ▼
┌──────────────────────────────┐     ┌──────────────────────────┐
│    Ethereum Network          │     │     IPFS (Pinata)        │
│  ┌─────────────────────────┐ │     │                          │
│  │  NFTCollection.sol      │ │     │  - NFT images            │
│  │  (ERC-721 + ERC-2981)   │ │     │  - JSON metadata         │
│  └─────────────────────────┘ │     │                          │
│  ┌─────────────────────────┐ │     └──────────────────────────┘
│  │  NFTMarketplace.sol     │ │
│  │  (Listings + Auctions)  │ │
│  └─────────────────────────┘ │
└──────────────────────────────┘
```

---

## 2. Smart Contract Architecture

### 2.1 NFTCollection.sol

```
┌─────────────────────────────────────────────┐
│              NFTCollection                   │
│─────────────────────────────────────────────│
│ Inherits:                                    │
│  ├─ ERC721         (core NFT standard)       │
│  ├─ ERC721URIStorage (metadata URIs)         │
│  ├─ ERC721Enumerable (token enumeration)     │
│  ├─ ERC2981        (royalty standard)        │
│  └─ Ownable        (access control)          │
│─────────────────────────────────────────────│
│ State:                                       │
│  _nextTokenId : uint256                      │
│  MAX_ROYALTY_FEE : 1000 (10%)                │
│─────────────────────────────────────────────│
│ Functions:                                   │
│  + mintNFT(to, uri, royaltyFee) → tokenId    │
│  + getCreator(tokenId) → address             │
│  + tokenURI(tokenId) → string                │
│  + totalSupply() → uint256                   │
│  + supportsInterface(id) → bool              │
└─────────────────────────────────────────────┘
```

**Design Decisions:**
- **ERC-2981 per-token royalties**: Each NFT stores its own royalty receiver (the creator) and fee. This ensures creators earn on every resale.
- **ERC721Enumerable**: Enables efficient on-chain querying of all tokens owned by a user — essential for the Profile page.
- **Open minting**: Anyone can mint (no whitelist). This aligns with a permissionless marketplace ethos.
- **10% max royalty cap**: Prevents abusive royalty fees that could deter buyers.

### 2.2 NFTMarketplace.sol

```
┌─────────────────────────────────────────────────────┐
│                  NFTMarketplace                     │
│─────────────────────────────────────────────────────│
│ Inherits:                                           │
│  ├─ Ownable         (admin controls)                │
│  └─ ReentrancyGuard (security)                      │
│─────────────────────────────────────────────────────│
│ State:                                              │
│  listings    : mapping(uint256 → Listing)           │
│  auctions    : mapping(uint256 → Auction)           │
│  pendingWithdrawals : mapping(address → uint256)    │
│  platformFeeBps : uint256 (default 250 = 2.5%)      │
│─────────────────────────────────────────────────────│
│ Fixed-Price Flow:                                   │
│  + listNFT(nftContract, tokenId, price) → listingId │
│  + buyNFT(listingId) [payable]                      │
│  + cancelListing(listingId)                         │
│─────────────────────────────────────────────────────│
│ Auction Flow:                                       │
│  + createAuction(nft, tokenId, startPrice, duration)│
│  + placeBid(auctionId) [payable]                    │
│  + endAuction(auctionId)                            │
│─────────────────────────────────────────────────────│
│ Internal:                                           │
│  - _distributeFunds(nft, tokenId, seller, price)    │
│     → platformFee + royalty + sellerProceeds        │
│─────────────────────────────────────────────────────│
│ Admin:                                              │
│  + setPlatformFee(feeBps)                           │
│  + withdraw()                                       │
└─────────────────────────────────────────────────────┘
```

**Design Decisions:**
- **Separation of NFT and Marketplace contracts**: Follows the single-responsibility principle. The NFT contract handles token logic; the marketplace handles trading.
- **Pull-over-push pattern**: Outbid funds go to `pendingWithdrawals` rather than being sent directly. This prevents the "stuck auction" attack where a malicious contract rejects ETH transfers.
- **Escrow for auctions**: The NFT is transferred to the marketplace during an auction to prevent the seller from transferring it out mid-auction.
- **ERC-2981 royalty enforcement**: The marketplace reads `royaltyInfo()` from the NFT contract on every sale and automatically distributes royalties.
- **ReentrancyGuard**: Protects all payable functions against reentrancy attacks.

### 2.3 Fund Distribution Flow

```
Sale Price (msg.value)
    │
    ├── Platform Fee (2.5%)  ──→  Contract Owner
    │
    ├── Royalty (0-10%)      ──→  Original Creator (via ERC-2981)
    │
    └── Remainder            ──→  Seller
```

---

## 3. Frontend Architecture

### 3.1 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | React 18 + Vite | UI framework + fast bundler |
| Web3 | wagmi v2 + viem | Ethereum hooks + ABI encoding |
| Wallet | RainbowKit | Wallet connection UI |
| Styling | TailwindCSS | Utility-first CSS |
| Animation | Framer Motion | Page transitions + micro-interactions |
| Routing | React Router v6 | Client-side routing |
| State | React Query (via wagmi) | Server state caching |
| Storage | IPFS (Pinata) | Decentralized file storage |
| Notifications | react-hot-toast | Transaction status toasts |

### 3.2 Component Architecture

```
App
├── Layout
│   ├── Navbar (wallet connect, navigation, NetworkBadge)
│   └── Footer
├── Pages
│   ├── Home (hero, animated stats, featured NFT carousel, trending collections)
│   ├── Explore (search, filter sidebar, NFT grid with real images)
│   ├── Create (mint form + IPFS upload + dynamic traits input)
│   ├── NFTDetail (image, buy/bid, Make Offer modal, Offers tab, IPFS link, TransactionModal)
│   ├── Collection (banner, stats, NFT grid for a specific collection)
│   ├── Profile (banner + avatar, 4 tabs: Collected/Created/Favorited/Activity, List for Sale modal)
│   └── Activity (global transaction feed with event icons)
├── Data
│   └── mockData.js (centralized: 5 collections, 22 NFTs, user profile, helpers)
├── Components
│   ├── layout/ (Navbar, Footer, Layout)
│   └── ui/ (Breadcrumb, NetworkBadge, TransactionModal, LoadingSpinner, Toast)
└── Hooks
    ├── useNFTCollection (read/write NFT contract)
    ├── useMarketplace (read/write marketplace contract)
    └── useIPFS (IPFS upload)
```

### 3.3 Key UI Components

**Breadcrumb** — Reusable navigation component showing page hierarchy (e.g., Home > Explore > NFT Name). Used on all sub-pages.

**NetworkBadge** — Displays connected blockchain network with a pulsing colored dot. Green for supported networks (Sepolia, Hardhat Local), red for unsupported. Uses wagmi's `useChainId()` and `useAccount()`.

**TransactionModal** — 4-stage simulated transaction flow:
1. "Waiting for Wallet Approval" (1.5s, pulsing wallet icon)
2. "Transaction Pending on Blockchain" (2.5s, progress bar, mock tx hash)
3. "Success!" (green checkmark, auto-dismiss after 2s)
4. "Transaction Failed" (red X, retry/close buttons) — triggered via `simulateError` prop

Used by: Buy Now, Place Bid, Make Offer, List for Sale, and Mint NFT flows.

**ErrorBoundary** — React class component wrapping the entire app to catch render errors and display a styled fallback UI with "Go Home" navigation instead of a white screen.

**ScrollToTop** — Resets scroll position to top on every route change using `useLocation()` + `useEffect`.

**Custom Wallet Menu** — Replaces RainbowKit's default account button when connected. Shows wallet address, network switching dropdown (Hardhat ↔ Sepolia) via wagmi's `useSwitchChain`, and disconnect button via `useDisconnect`.

**404 / Not Found** — Catch-all route displaying a gradient "404" page. Null guards on NFTDetail and Collection pages show contextual "Not Found" cards instead of crashes.

### 3.4 Data Flow

```
User Action
    │
    ▼
React Component (e.g., BuyButton)
    │
    ▼
Custom Hook (e.g., useBuyNFT)
    │
    ▼
wagmi useWriteContract
    │
    ▼
viem encodes ABI call
    │
    ▼
Wallet (MetaMask) signs transaction
    │
    ▼
Ethereum Network processes transaction
    │
    ▼
wagmi useWaitForTransactionReceipt
    │
    ▼
UI updates (toast notification, state refresh)
```

---

## 4. Sequence Diagrams

### 4.1 Mint NFT Flow

```
User          Frontend       IPFS/Pinata     Blockchain
 │               │               │               │
 │ Upload Image  │               │               │
 │──────────────>│               │               │
 │               │ Pin File      │               │
 │               │──────────────>│               │
 │               │   ipfs://hash │               │
 │               │<──────────────│               │
 │               │ Pin Metadata  │               │
 │               │──────────────>│               │
 │               │ ipfs://meta   │               │
 │               │<──────────────│               │
 │               │ mintNFT(to, uri, royalty)     │
 │               │──────────────────────────────>│
 │  Confirm Tx   │               │               │
 │<──────────────│               │               │
 │               │         NFTMinted event       │
 │               │<──────────────────────────────│
 │  Success!     │               │               │
 │<──────────────│               │               │
```

### 4.2 Buy NFT Flow

```
Buyer         Frontend       Marketplace     NFTCollection
  │               │               │               │
  │ Click "Buy"   │               │               │
  │──────────────>│               │               │
  │               │ buyNFT(id) + ETH             │
  │               │──────────────>│               │
  │               │               │ royaltyInfo() │
  │               │               │──────────────>│
  │               │               │  (recv, amt)  │
  │               │               │<──────────────│
  │               │               │               │
  │               │               │ Transfer ETH to:
  │               │               │  → Platform Owner (2.5%)
  │               │               │  → Creator (royalty)
  │               │               │  → Seller (remainder)
  │               │               │               │
  │               │               │ safeTransferFrom
  │               │               │──────────────>│
  │               │               │               │
  │               │    Sold event │               │
  │               │<──────────────│               │
  │  NFT Owned!   │               │               │
  │<──────────────│               │               │
```

### 4.3 Auction Flow

```
Seller        Frontend       Marketplace       Bidder
  │               │               │               │
  │ Create Auction│               │               │
  │──────────────>│               │               │
  │               │ createAuction │               │
  │               │──────────────>│               │
  │               │ (NFT escrowed)│               │
  │               │               │               │
  │               │               │   placeBid()  │
  │               │               │<──────────────│
  │               │               │  BidPlaced    │
  │               │               │──────────────>│
  │               │               │               │
  │               │  (after endTime)              │
  │               │               │               │
  │               │ endAuction()  │               │
  │               │──────────────>│               │
  │               │               │ distribute $  │
  │               │               │ transfer NFT  │
  │               │ AuctionEnded  │──────────────>│
  │               │<──────────────│               │
```

---

## 5. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Reentrancy attacks | ReentrancyGuard on all payable functions |
| Stuck auctions (gas griefing) | Pull-payment pattern for bid refunds |
| Front-running | Acceptable for NFT marketplace; auctions use block.timestamp |
| Integer overflow | Solidity 0.8+ has built-in overflow checks |
| Unauthorized access | Ownable for admin functions, require() for ownership checks |
| NFT theft during auction | Escrow pattern: NFT held by marketplace contract |
| Excessive royalties | MAX_ROYALTY_FEE = 10% cap |
| Platform fee abuse | MAX_FEE = 10% cap, only owner can change |

---

## 6. Deployment Architecture

```
┌─────────────────────────────────┐
│         Development             │
│  Hardhat Local Node (31337)     │
│  Fast iteration, auto-mining    │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│         Staging / Demo          │
│  Sepolia Testnet (11155111)     │
│  Free test ETH, public access   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│     Frontend Hosting            │
│  Vite build → static files      │
│  (Vercel / Netlify / IPFS)      │
└─────────────────────────────────┘
```

---

## 7. Design Rationale Summary

1. **Why separate NFT + Marketplace contracts?** Single-responsibility, upgradability, and composability. Other marketplaces can list NFTs from our collection, and our marketplace can trade NFTs from other collections.

2. **Why ERC-2981?** It's the standard for on-chain royalties. By reading royalty info from the NFT contract, our marketplace is compatible with any ERC-2981 collection.

3. **Why pull-payment for auctions?** The push pattern (sending ETH directly) can fail if the recipient is a contract that reverts. Pull-payment (pendingWithdrawals) avoids denial-of-service.

4. **Why wagmi + viem over ethers.js?** wagmi provides React hooks for contract reads/writes with built-in caching, error handling, and wallet management. viem is a modern, type-safe alternative to ethers.js with smaller bundle size.

5. **Why IPFS for metadata?** Decentralized storage ensures NFT metadata persists even if our servers go down. IPFS content-addressing guarantees immutability.

6. **Why dark theme?** Industry standard for NFT marketplaces (OpenSea, Blur, Magic Eden). Reduces eye strain and makes colorful NFT artwork pop.
