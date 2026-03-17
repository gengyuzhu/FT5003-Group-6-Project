# NFT Marketplace — Architecture & Design Document

**FT5003 Blockchain Innovations — NUS**

---

## 1. System Overview

The NFT Marketplace is a decentralized application (dApp) that enables users to mint, list, buy, and auction ERC-721 NFTs on the Ethereum blockchain. The platform enforces ERC-2981 royalties on every secondary sale and charges a configurable platform fee.

### High-Level Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                │
│  ┌─────────┐   ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ RainbowKit│ │  wagmi   │  │  Framer  │  │ TailwindCSS  │   │
│  │ (Wallet) │  │ (Hooks)  │  │ Motion   │  │  (Styling)   │   │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────────┘   │
│       │              │                                        │
│       └──────┬───────┘                                        │
│              │                                                │
└──────────────┼────────────────────────────────────────────────┘
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
│  │  (Listings + Auctions   │ │
│  │   Pausable + Pull-Pay)  │ │
│  └─────────────────────────┘ │
│  ┌─────────────────────────┐ │
│  │  SimpleOracle.sol       │ │
│  │  (Multi-reporter Oracle)│ │
│  └─────────────────────────┘ │
└──────────────────────────────┘
```

---

## 2. Smart Contract Architecture

### 2.1 NFTCollection.sol

```
┌─────────────────────────────────────────────┐
│              NFTCollection                  │
│─────────────────────────────────────────────│
│ Inherits:                                   │
│  ├─ ERC721         (core NFT standard)      │
│  ├─ ERC721URIStorage (metadata URIs)        │
│  ├─ ERC721Enumerable (token enumeration)    │
│  ├─ ERC2981        (royalty standard)       │
│  └─ Ownable        (access control)         │
│─────────────────────────────────────────────│
│ State:                                      │
│  _nextTokenId : uint256                     │
│  MAX_ROYALTY_FEE : 1000 (10%)               │
│─────────────────────────────────────────────│
│ Functions:                                  │
│  + mintNFT(to, uri, royaltyFee) → tokenId   │
│  + getCreator(tokenId) → address            │
│  + tokenURI(tokenId) → string               │
│  + totalSupply() → uint256                  │
│  + supportsInterface(id) → bool             │
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
│  ├─ ReentrancyGuard (security)                      │
│  └─ Pausable        (emergency stop)                │
│─────────────────────────────────────────────────────│
│ Custom Errors (18):                                 │
│  PriceZero, NotTokenOwner, MarketplaceNotApproved,  │
│  ListingNotActive, ListingExpiredError, IncorrectPrice│
│  SellerCannotBuy, NotTheSeller, AuctionAlreadyEnded,│
│  AuctionExpired, AuctionNotExpired, SellerCannotBid,│
│  BidBelowStartPrice, BidTooLow, BidIncrementTooLow,│
│  NothingToWithdraw, TransferFailed, FeeTooHigh,     │
│  InvalidDuration                                    │
│─────────────────────────────────────────────────────│
│ State:                                              │
│  listings    : mapping(uint256 → Listing)           │
│  auctions    : mapping(uint256 → Auction)           │
│  pendingWithdrawals : mapping(address → uint256)    │
│  platformFeeBps : uint256 (default 250 = 2.5%)      │
│  MIN_BID_INCREMENT_BPS : 500 (5%)                   │
│─────────────────────────────────────────────────────│
│ Listing struct includes `expiration` field          │
│  (0 = no expiry, else unix timestamp)               │
│─────────────────────────────────────────────────────│
│ Fixed-Price Flow:                                   │
│  + listNFT(nft, tokenId, price, duration) → id     │
│  + buyNFT(listingId) [payable, checks expiration]   │
│  + cancelListing(listingId)                         │
│  + updateListingPrice(listingId, newPrice)          │
│  + isListingExpired(listingId) → bool               │
│─────────────────────────────────────────────────────│
│ Auction Flow:                                       │
│  + createAuction(nft, tokenId, startPrice, duration)│
│  + placeBid(auctionId) [payable]                    │
│  + endAuction(auctionId)                            │
│  + cancelAuction(auctionId) [no bids only]          │
│─────────────────────────────────────────────────────│
│ Internal:                                           │
│  - _distributeFunds(nft, tokenId, seller, price)    │
│     → accumulates into pendingWithdrawals:          │
│       platformFee → owner, royalty → creator,       │
│       remainder → seller (pull-payment pattern)     │
│─────────────────────────────────────────────────────│
│ Admin:                                              │
│  + setPlatformFee(feeBps)                           │
│  + withdraw()                                       │
│  + pause() / unpause()  [onlyOwner]                 │
└─────────────────────────────────────────────────────┘
```

**Design Decisions:**
- **Separation of NFT and Marketplace contracts**: Follows the single-responsibility principle. The NFT contract handles token logic; the marketplace handles trading.
- **Full pull-payment pattern**: All fund distribution (platform fees, royalties, seller proceeds) goes to `pendingWithdrawals`. Recipients call `withdraw()` to claim. This prevents reentrancy, gas griefing, and "stuck auction" attacks.
- **Pausable**: OpenZeppelin Pausable allows the contract owner to freeze all marketplace operations in an emergency.
- **Custom errors**: 18 custom errors replace `require()` strings, saving ~200 gas per revert and enabling richer client-side error decoding.
- **Listing expiration**: Listings accept an optional `duration` parameter; `buyNFT` reverts if the listing has expired.
- **Minimum bid increment**: `MIN_BID_INCREMENT_BPS = 500` (5%) prevents bid sniping with trivially small increments.
- **Escrow for auctions**: The NFT is transferred to the marketplace during an auction to prevent the seller from transferring it out mid-auction.
- **ERC-2981 royalty enforcement**: The marketplace reads `royaltyInfo()` from the NFT contract on every sale and automatically distributes royalties.
- **ReentrancyGuard**: Protects all payable functions against reentrancy attacks.

### 2.3 Fund Distribution Flow

```
Sale Price (msg.value)
    │
    ├── Platform Fee (2.5%)  ──→  pendingWithdrawals[owner]
    │
    ├── Royalty (0-10%)      ──→  pendingWithdrawals[creator] (via ERC-2981)
    │
    └── Remainder            ──→  pendingWithdrawals[seller]

All recipients call withdraw() to claim their funds (pull-payment).
```

### 2.4 SimpleOracle.sol

```
┌─────────────────────────────────────────────────────┐
│                   SimpleOracle                       │
│─────────────────────────────────────────────────────│
│ Inherits:                                           │
│  └─ Ownable         (admin controls)                │
│─────────────────────────────────────────────────────│
│ Custom Errors:                                      │
│  NotAuthorizedReporter, StalePrice, AlreadyReporter,│
│  NotReporter, AlreadySubmitted, NoPrice             │
│─────────────────────────────────────────────────────│
│ State:                                              │
│  reporters         : mapping(address → bool)        │
│  currentRound      : uint256                        │
│  latestPrice       : uint256                        │
│  latestTimestamp    : uint256                        │
│  MIN_REPORTERS     : 3                              │
│  STALENESS_PERIOD  : 1 hour                         │
│─────────────────────────────────────────────────────│
│ Functions:                                          │
│  + addReporter(addr) [onlyOwner]                    │
│  + removeReporter(addr) [onlyOwner]                 │
│  + submitPrice(price) [onlyReporter]                │
│    → finalizes round with median when MIN_REPORTERS │
│  + getLatestPrice() → (price, timestamp)            │
│    → reverts if stale (>1h)                         │
│  + getLatestPriceUnsafe() → (price, timestamp)      │
└─────────────────────────────────────────────────────┘
```

**Design Decisions:**
- **Median aggregation**: Uses the median of submitted prices rather than mean, making it resistant to outlier manipulation by a single bad reporter.
- **Round-based**: Each reporter submits once per round; round finalizes when MIN_REPORTERS (3) have submitted.
- **Staleness check**: `getLatestPrice()` reverts if no fresh price within 1 hour, preventing use of outdated data.
- **Authorized reporters**: Only owner-approved addresses can submit prices, preventing spam.

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
| Global State | Zustand (persist) | Persistent favorites (localStorage) |
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
│   ├── Activity (global transaction feed with event icons, real-time simulation, time-range filter)
│   └── Market (Fear & Greed gauge, live stat cards, collection rankings, top sales, market pulse)
├── Data
│   └── mockData.js (centralized: 5 collections, 22 NFTs, user profile, helpers)
├── Stores
│   └── useFavoritesStore.js (Zustand + persist → localStorage)
├── Components
│   ├── layout/ (Navbar, Footer, Layout, ScrollToTop)
│   ├── oracle/ (OracleDashboard, OracleAttackSimulator, OracleEducationPanel)
│   ├── nft/ (NFTCard, NFTGrid, MintForm)
│   ├── marketplace/ (ListingCard, BuyButton, AuctionCard, PlaceBidForm)
│   ├── market/ (FearGreedGauge, StatCard, TopSalesCarousel, CollectionRankings, MarketPulse, KeyInsights)
│   └── ui/ (Breadcrumb, NetworkBadge, TransactionModal, ErrorBoundary, Skeleton, LoadingSpinner, Modal, Toast)
├── Services
│   └── oracleService.js (pure JS oracle simulation engine)
├── Utils
│   ├── animations.js (shared Framer Motion variants)
│   └── errorMessages.js (bilingual error mapping for contract custom errors)
└── Hooks
    ├── useNFTCollection (read/write NFT contract, multicall for user NFTs)
    ├── useMarketplace (read/write marketplace, listing with duration)
    ├── useListings (multicall for all on-chain listings + auctions)
    ├── useIPFS (IPFS upload)
    ├── useOracle (oracle simulation state + controls)
    └── useOracleContract (wagmi hooks for on-chain SimpleOracle)
```

### 3.3 Key UI Components

**Breadcrumb** — Reusable navigation component showing page hierarchy (e.g., Home > Explore > NFT Name). Used on all sub-pages.

**NetworkBadge** — Displays connected blockchain network with a pulsing colored dot. Green for supported networks (Sepolia, Hardhat Local), red for unsupported. Uses wagmi's `useChainId()` and `useAccount()`.

**TransactionModal** — 4-stage transaction flow supporting both real wagmi state and mock simulation:
- **Real mode** (wallet connected): Derives stage from `isPending`, `isConfirming`, `isSuccess`, `error` props from wagmi hooks. Shows real tx hash linking to Etherscan. Indeterminate progress bar during confirmation.
- **Mock mode** (no wagmi props): Timer-based simulation with deterministic progress bar.
- Both modes: Focus trap (Tab key cycling), Escape to close, ARIA `role="dialog"` + `aria-modal="true"`.
- Stages: 1) Wallet Approval 2) Blockchain Pending 3) Success (auto-dismiss) 4) Error (retry/close)

Used by: Buy Now, Place Bid, Make Offer, List for Sale, and Mint NFT flows.

**ErrorBoundary** — React class component wrapping the entire app to catch render errors and display a styled fallback UI with "Go Home" navigation instead of a white screen.

**ScrollToTop** — Resets scroll position to top on every route change using `useLocation()` + `useEffect`.

**Custom Wallet Menu** — Replaces RainbowKit's default account button when connected. Shows wallet address, network switching dropdown (Hardhat ↔ Sepolia) via wagmi's `useSwitchChain`, and disconnect button via `useDisconnect`.

**Skeleton Components** — Reusable loading placeholders (`NFTCardSkeleton`, `NFTDetailSkeleton`, `ProfileSkeleton`, `MarketSkeleton`, `SkeletonPulse`) providing smooth shimmer animations while data loads. Built with Tailwind `animate-pulse`.

**Friendly Error Messages** — `errorMessages.js` maps all 18+ contract custom errors and common wallet/transaction errors to bilingual (EN/ZH) user-friendly messages. `getFriendlyError(error, lang)` parses viem/wagmi error strings and returns contextual messages for the TransactionModal.

**Oracle Bridge** — `useOracle` hook integrates with `useOracleContract` to prefer on-chain oracle data when wallet is connected. Falls back to client-side ASTREA simulation when disconnected or on-chain data is unavailable.

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
| Stuck auctions (gas griefing) | Full pull-payment pattern for ALL fund distribution |
| Front-running | Acceptable for NFT marketplace; auctions use block.timestamp |
| Integer overflow | Solidity 0.8+ has built-in overflow checks |
| Unauthorized access | Ownable for admin, custom errors for ownership checks |
| NFT theft during auction | Escrow pattern: NFT held by marketplace contract |
| Excessive royalties | MAX_ROYALTY_FEE = 10% cap |
| Platform fee abuse | MAX_FEE = 10% cap, only owner can change |
| Emergency shutdown | Pausable: owner can freeze all operations |
| Bid sniping | MIN_BID_INCREMENT_BPS = 500 (5% minimum increase) |
| Stale listings | Optional expiration on listings, checked at buy time |
| Oracle manipulation | Median aggregation + staleness checks in SimpleOracle |

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

## 7. Oracle Price Feed Architecture

### Data Flow

```
Oracle Service (client-side simulation, 3.5s interval)
    |
    +-- 7 Oracle Nodes (Singapore, Tokyo, New York, London, Frankfurt, Sydney, Sao Paulo)
    |   |-- Honest nodes: true price + small noise (0.15%)
    |   +-- Malicious nodes: true price + large deviation (5-20%)
    |
    +-- Aggregation Engine
    |   |-- Mode A: Centralized (single node #1)
    |   |-- Mode B: Simple Average (arithmetic mean of all)
    |   +-- Mode C: ASTREA (stake-weighted median + outlier slashing)
    |
    +-- Consensus Price --> Market.jsx stat cards (ETH -> USD conversion)
```

### Component Hierarchy

```
Market (page)
+-- useOracle() hook --> { oracleState, setMode, toggleMalicious, ethUsdPrice }
+-- useLiveMarketData() --> liveData (market cap, volume, sales fluctuations)
|
+-- FearGreedGauge <-- fearGreedScore
+-- StatCard x4 <-- animated values + ethUsdPrice for USD conversion
|   +-- badge="Oracle Price Feed" on USD-showing cards
|
+-- OracleAttackSimulator <-- oracleState, setMode, toggleMalicious, resetNetwork
|   +-- 3-Step Stepper (Centralized Failure → Average Vulnerability → ASTREA Defense)
|   +-- Step Panel (instruction, hint, completion badge, accuracy snapshot)
|   +-- Completion Summary (3-column accuracy comparison + Run Again button)
|
+-- OracleDashboard <-- oracleState, callbacks
|   +-- ModeSelector (Centralized | Simple Average | ASTREA)
|   +-- NodeGrid (7 clickable node cards)
|   +-- PriceConsensusChart (SVG: true price line, consensus line, node dots)
|   +-- ResultComparison (3 cards: price, deviation, accuracy per mode)
|
+-- OracleEducationPanel (collapsible bilingual educational content)
|
+-- Collection Rankings, Top Sales, Market Pulse, Key Insights (unchanged)
```

### Centralization Analysis

| Component | Centralized | Decentralized |
|-----------|:-----------:|:-------------:|
| NFT Ownership (ERC-721) | | X |
| Marketplace Logic (Smart Contracts) | | X |
| Wallet Authentication | | X |
| Metadata Storage (IPFS) | | X |
| Frontend Hosting | X | |
| Price Feed (client-side ASTREA simulation) | | X |
| Price Feed (on-chain SimpleOracle) | | X |
| Market Analytics Data | X | |

**Conclusion**: The application is **partially decentralized**. Core transactional logic lives on-chain, while the presentation layer and some data aggregation remain centralized. The Oracle demonstration shows how price feeds can transition from centralized to decentralized using ASTREA consensus.

---

## 8. Design Rationale Summary

1. **Why separate NFT + Marketplace contracts?** Single-responsibility, upgradability, and composability. Other marketplaces can list NFTs from our collection, and our marketplace can trade NFTs from other collections.

2. **Why ERC-2981?** It's the standard for on-chain royalties. By reading royalty info from the NFT contract, our marketplace is compatible with any ERC-2981 collection.

3. **Why pull-payment for auctions?** The push pattern (sending ETH directly) can fail if the recipient is a contract that reverts. Pull-payment (pendingWithdrawals) avoids denial-of-service.

4. **Why wagmi + viem over ethers.js?** wagmi provides React hooks for contract reads/writes with built-in caching, error handling, and wallet management. viem is a modern, type-safe alternative to ethers.js with smaller bundle size.

5. **Why a consistent animation system?** Each page defines Framer Motion variants (`pageVariants`, `fadeUp`, `stagger`) following a shared convention. `utils/animations.js` provides canonical variants that can be imported for consistency. This approach ensures each page can fine-tune its own transitions while following the same patterns.

6. **Why IPFS for metadata?** Decentralized storage ensures NFT metadata persists even if our servers go down. IPFS content-addressing guarantees immutability.

7. **Why dark theme?** Industry standard for NFT marketplaces (OpenSea, Blur, Magic Eden). Reduces eye strain and makes colorful NFT artwork pop.
