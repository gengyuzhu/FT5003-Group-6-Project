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
│  │  (ERC-721 + ERC-2981    │ │     │  - JSON metadata         │
│  │   ERC-4907 + Collab)    │ │     │                          │
│  └─────────────────────────┘ │     └──────────────────────────┘
│  ┌─────────────────────────┐ │
│  │  NFTMarketplace.sol     │ │
│  │  (8 Sale Mechanisms     │ │
│  │   Rental + Reputation)  │ │
│  └─────────────────────────┘ │
│  ┌─────────────────────────┐ │
│  │  PriceOracle.sol        │ │
│  │  (Staking + Slashing    │ │
│  │   Chainlink Compatible) │ │
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
│  ├─ ERC2981        (royalty standard)        │
│  └─ IERC4907      (rental / user role)      │
│─────────────────────────────────────────────│
│ State:                                      │
│  _nextTokenId : uint256                     │
│  MAX_ROYALTY_FEE : 1000 (10%)               │
│  _users : tokenId → UserInfo{user,expires}  │
│  _collabInfo : tokenId → CollabInfo         │
│  isCollaborative : tokenId → bool           │
│  pendingCreatorPayments : address → uint256  │
│─────────────────────────────────────────────│
│ Functions:                                  │
│  + mintNFT(to, uri, royaltyFee) → tokenId   │
│  + collaborativeMint(to, uri, fee,          │
│      creators[], sharesBps[]) → tokenId     │
│  + distributeRoyalty(tokenId) payable        │
│  + withdrawCreatorPayment()                 │
│  + setUser(tokenId, user, expires)           │
│  + userOf(tokenId) → address                │
│  + userExpires(tokenId) → uint256           │
│  + getCreator(tokenId) → address            │
│  + getCollabInfo(tokenId) → (addr[],uint[]) │
└─────────────────────────────────────────────┘
```

**Design Decisions:**
- **ERC-2981 per-token royalties**: Each NFT stores its own royalty receiver (the creator) and fee. This ensures creators earn on every resale.
- **ERC-4907 rental**: Adds a time-limited "user" role separate from "owner". The NFT never leaves the owner's wallet — usage rights expire automatically. On transfer, user info is cleared. OpenSea does not support this standard.
- **Collaborative minting**: Multiple creators co-mint a single NFT with on-chain shares (BPS summing to 10000). Royalty receiver is set to the contract itself, and `distributeRoyalty()` splits incoming ETH proportionally. Uses pull-payment pattern for creator withdrawals.
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
│ Custom Errors (37):                                 │
│  PriceZero, NotTokenOwner, MarketplaceNotApproved,  │
│  ListingNotActive, ListingExpiredError,              │
│  InsufficientPayment, ExcessivePayment, OracleNotSet,│
│  SellerCannotBuy, NotTheSeller, AuctionAlreadyEnded,│
│  AuctionExpired, AuctionNotExpired, SellerCannotBid,│
│  BidBelowStartPrice, BidTooLow, BidIncrementTooLow,│
│  NothingToWithdraw, TransferFailed, FeeTooHigh,     │
│  InvalidDuration, AuctionHasBids,                   │
│  ArrayLengthMismatch, BatchTooLarge,                │
│  EndPriceTooHigh, DutchAuctionEnded,                │
│  OfferNotActive, OfferExpired,                      │
│  SwapNotActive, NotCounterparty, SwapExpired,       │
│  RentalListingNotActive, RentalDurationInvalid,     │
│  AlreadyRated, InvalidRating, NotTxParticipant,     │
│  TxNotFound                                         │
│─────────────────────────────────────────────────────│
│ State:                                              │
│  oracle      : ISimpleOracle (PriceOracle feed)      │
│  listings    : mapping(uint256 → Listing)           │
│  auctions    : mapping(uint256 → Auction)           │
│  dutchAuctions : mapping(uint256 → DutchAuction)   │
│  offers      : mapping(uint256 → Offer)             │
│  swaps       : mapping(uint256 → Swap)              │
│  rentalListings : mapping(uint256 → RentalListing)  │
│  completedTxs : mapping(uint256 → CompletedTx)     │
│  txRatings   : txId → rater → score (1-5)          │
│  reputationScore : address → uint256                │
│  ratingCount : address → uint256                    │
│  pendingWithdrawals : mapping(address → uint256)    │
│  platformFeeBps : uint256 (default 250 = 2.5%)      │
│  MIN_BID_INCREMENT_BPS : 500 (5%)                   │
│  SLIPPAGE_BPS : 200 (2% buyer slippage tolerance)   │
│  BPS_DENOMINATOR : 10000                            │
│  USD_WEI_FACTOR : 1e24 (wei * oracle / cents)       │
│  MIN_AUCTION_DURATION : 1 hour                      │
│  MAX_AUCTION_DURATION : 7 days                      │
│  MAX_BATCH_SIZE : 20                                │
│  ANTI_SNIPE_DURATION : 5 minutes                   │
│─────────────────────────────────────────────────────│
│ Listing struct:                                     │
│  seller, nftContract, tokenId, priceUsdCents,       │
│  active, expiration (0 = no expiry)                 │
│─────────────────────────────────────────────────────│
│ DutchAuction struct:                                │
│  seller, nftContract, tokenId,                      │
│  startPriceUsdCents, endPriceUsdCents,              │
│  startTime, endTime, sold                           │
│─────────────────────────────────────────────────────│
│ Offer struct:                                       │
│  buyer, nftContract, tokenId,                       │
│  amount, expiration, active                         │
│─────────────────────────────────────────────────────│
│ Fixed-Price Flow (USD-denominated):                 │
│  + listNFT(nft, tokenId, priceUsdCents, duration)   │
│  + batchListNFT(nfts[], tokenIds[], prices[],       │
│      durations[]) → listingIds[]                    │
│    [emits BatchListed(listingIds, seller)]          │
│  + buyNFT(listingId) [payable, oracle ETH conv.]    │
│  + cancelListing(listingId)                         │
│  + updateListingPrice(listingId, newPriceUsdCents)  │
│  + getListingPriceInWei(id) → (requiredWei, maxWei) │
│  + isListingExpired(listingId) → bool               │
│─────────────────────────────────────────────────────│
│ Auction Flow:                                       │
│  + createAuction(nft, tokenId, startPrice, duration)│
│  + placeBid(auctionId) [payable]                    │
│    → if bid within last 5 min: extend by 5 min      │
│      [emits AuctionExtended(auctionId, newEndTime)] │
│  + endAuction(auctionId)                            │
│  + cancelAuction(auctionId) [no bids only]          │
│─────────────────────────────────────────────────────│
│ Dutch Auction Flow:                                 │
│  + createDutchAuction(nft, tokenId,                 │
│      startPriceUsdCents, endPriceUsdCents, duration)│
│    [NFT escrowed; emits DutchAuctionCreated]        │
│  + buyDutchAuction(id) [payable]                    │
│    → price decreases linearly over duration         │
│    → oracle converts current USD price → ETH        │
│    → no ExcessivePayment check; excess refunded     │
│      via pendingWithdrawals                         │
│    [emits DutchAuctionSold]                         │
│  + cancelDutchAuction(id) [seller, unsold only]     │
│    [emits DutchAuctionCancelled]                    │
│  + getDutchAuctionCurrentPrice(id) → usdCents       │
│  + getDutchAuctionPriceInWei(id) → wei              │
│  + getDutchAuctionCount() → uint256                 │
│─────────────────────────────────────────────────────│
│ On-Chain Offer Flow:                                │
│  + makeOffer(nftContract, tokenId, expiration)      │
│    [payable; ETH escrowed on-chain]                 │
│    [emits OfferMade]                                │
│  + acceptOffer(offerId) [NFT owner only]            │
│    → NFT transfers; funds via _distributeFunds      │
│    [emits OfferAccepted]                            │
│  + cancelOffer(offerId) [buyer only]                │
│    → ETH returned via pendingWithdrawals            │
│    [emits OfferCancelled]                           │
│  + getOfferCount() → uint256                        │
│─────────────────────────────────────────────────────│
│ P2P Swap Flow:                                      │
│  + proposeSwap(counterparty, nftContract1, tokenId1,│
│      nftContract2, tokenId2, duration) [payable]    │
│    [proposer NFT escrowed; optional ETH top-up]     │
│    [emits SwapProposed]                             │
│  + acceptSwap(swapId) [counterparty only]           │
│    → atomic swap of both NFTs                       │
│    → ETH top-up via _distributeFunds                │
│    [emits SwapExecuted]                             │
│  + cancelSwap(swapId) [proposer only]               │
│    → NFT + ETH returned to proposer                 │
│    [emits SwapCancelled]                            │
│  + getSwapCount() → uint256                         │
│─────────────────────────────────────────────────────│
│ NFT Rental Flow (ERC-4907):                         │
│  + listForRent(nft, tokenId, dailyPriceUsd, maxDays)│
│    [NFT stays in owner wallet; emits RentalListed]  │
│  + rentNFT(rentalId, days) [payable]                │
│    → calls setUser() on NFT contract (ERC-4907)     │
│    → funds via _distributeFunds                     │
│    [emits NFTRented; records CompletedTx]           │
│  + cancelRentalListing(rentalId) [owner only]       │
│    [emits RentalCancelled]                          │
│  + getRentalListingCount() → uint256                │
│─────────────────────────────────────────────────────│
│ On-Chain Reputation System:                         │
│  + rateTransaction(txId, score) [1-5, once each]    │
│    → buyer rates seller, seller rates buyer         │
│    → permanent, immutable on-chain ratings          │
│    [emits TransactionRated]                         │
│  + getReputation(user) → (avgScore100, totalRatings)│
│  + getCompletedTxCount() → uint256                  │
│  All sale types auto-record CompletedTx:            │
│    0=fixed, 1=auction, 2=dutch, 3=offer,            │
│    4=swap, 5=rental                                 │
│─────────────────────────────────────────────────────│
│ Internal:                                           │
│  - _getRequiredWei(priceUsdCents) → uint256         │
│     → reads oracle, converts USD cents to wei       │
│  - _createListing(nft, tokenId, price, duration)    │
│     → shared helper used by listNFT + batchListNFT  │
│  - _distributeFunds(nft, tokenId, seller, price)    │
│     → accumulates into pendingWithdrawals:          │
│       platformFee → owner, royalty → creator,       │
│       remainder → seller (pull-payment pattern)     │
│     → collaborative NFTs: royalty sent directly to  │
│       NFTCollection.distributeRoyalty() for split    │
│  - _recordTx(buyer, seller, nft, tokenId, txType)   │
│     → creates CompletedTx for reputation system     │
│─────────────────────────────────────────────────────│
│ Admin:                                              │
│  + setOracle(address) [onlyOwner, emits OracleUpdated]│
│  + setPlatformFee(feeBps)                           │
│  + withdraw()                                       │
│  + pause() / unpause()  [onlyOwner]                 │
│  + onERC721Received() [ERC721 receiver support]     │
└─────────────────────────────────────────────────────┘
```

**Design Decisions:**
- **Separation of NFT and Marketplace contracts**: Follows the single-responsibility principle. The NFT contract handles token logic; the marketplace handles trading.
- **Full pull-payment pattern**: All fund distribution (platform fees, royalties, seller proceeds) goes to `pendingWithdrawals`. Recipients call `withdraw()` to claim. This prevents reentrancy, gas griefing, and "stuck auction" attacks.
- **Pausable**: OpenZeppelin Pausable allows the contract owner to freeze all marketplace operations in an emergency.
- **Custom errors**: 37 marketplace errors + 10 oracle errors replace `require()` strings, saving ~200 gas per revert and enabling richer client-side error decoding. Rental adds `RentalListingNotActive`/`RentalDurationInvalid`; reputation adds `AlreadyRated`/`InvalidRating`/`NotTxParticipant`/`TxNotFound`; the oracle adds `InsufficientStake`/`NoStakeToWithdraw`/`UnstakeDuringRound` for staking and `RoundTooFrequent` for flash-loan protection.
- **ERC-4907 NFT rental**: The marketplace calls `setUser()` on the NFT contract to grant time-limited usage rights. The NFT never leaves the owner's wallet (no escrow). Price is USD per day converted via oracle. This is a feature OpenSea does not support at all.
- **Collaborative NFT royalty distribution**: `_distributeFunds` detects collaborative NFTs via `INFTCollaborative.isCollaborative()` and sends royalty directly to the NFT contract's `distributeRoyalty()` function, which splits it among creators using pull-payment.
- **On-chain reputation system**: Every completed transaction (across all 6 sale types) auto-records a `CompletedTx` entry with buyer, seller, NFT, and type. Both parties can rate (1–5) once per transaction. Ratings are permanent and immutable, stored on-chain. `getReputation()` returns average score (×100 for precision). This solves the "rug pull seller" problem that OpenSea cannot address.
- **Dutch auction escrow**: NFT is escrowed in the marketplace on `createDutchAuction`, matching the English auction pattern. Price is computed linearly at buy time; no `ExcessivePayment` check is applied because declining-price mechanics mean overpaying is expected — the excess is refunded via pull-payment.
- **On-chain offers**: ETH is locked in `pendingWithdrawals` on `makeOffer`, making funds fully transparent and slashing counterparty risk. Unlike OpenSea's off-chain Seaport orders, every offer is visible and verifiable on-chain. Multiple offers can exist simultaneously for the same NFT.
- **P2P NFT swaps**: Atomic bartering mechanism where two parties exchange NFTs directly. The proposer's NFT is escrowed on proposal; an optional ETH top-up can compensate for value differences and is distributed via `_distributeFunds` (platform fee + royalty). The counterparty accepts to trigger an atomic swap of both NFTs. Proposer can cancel to reclaim their escrowed NFT and ETH. Swaps have configurable duration with `SwapExpired` protection.
- **USD-denominated listings with oracle conversion**: Sellers list in USD cents for price stability (targeting traditional artists). At purchase time, the oracle converts USD to ETH via `_getRequiredWei()` using a rounding-up formula to protect the seller. 2% slippage tolerance protects buyers from overpaying (`ExcessivePayment` error); excess ETH within tolerance is refunded via pull-payment.
- **Listing expiration**: Listings accept an optional `duration` parameter; `buyNFT` reverts if the listing has expired.
- **Minimum bid increment**: `MIN_BID_INCREMENT_BPS = 500` (5%) prevents bid sniping with trivially small increments.
- **Escrow for auctions**: The NFT is transferred to the marketplace during an auction to prevent the seller from transferring it out mid-auction.
- **ERC-2981 royalty enforcement**: The marketplace reads `royaltyInfo()` from the NFT contract on every sale and automatically distributes royalties.
- **ReentrancyGuard**: Protects all payable functions against reentrancy attacks.
- **Batch listing**: `batchListNFT` accepts parallel arrays of NFT contracts, token IDs, prices, and durations (max `MAX_BATCH_SIZE = 20`). Each entry is processed by the shared `_createListing()` helper — the same path used by the single `listNFT` function — keeping logic DRY and auditable. OpenSea does not support on-chain batch listing; this is a deliberate platform differentiator.
- **Anti-snipe auction extension**: If a bid arrives when `block.timestamp >= endTime - ANTI_SNIPE_DURATION` (i.e., within the last 5 minutes), the auction's `endTime` is extended by `ANTI_SNIPE_DURATION` (5 minutes) and an `AuctionExtended` event is emitted. The extension can repeat indefinitely as long as snipe bids keep arriving, giving all participants a fair window to respond.

### 2.3 Fund Distribution Flow

```
Seller lists NFT at $X USD
    │
    ▼
Buyer calls buyNFT() with ETH
    │
    ▼
Oracle: requiredWei = ceil(priceUsdCents × 1e24 / oraclePrice)
    │
    ▼
msg.value checked: requiredWei ≤ msg.value ≤ requiredWei + 2%
    │
    ├── Platform Fee (2.5%)  ──→  pendingWithdrawals[owner]
    │
    ├── Royalty (0-10%)      ──→  pendingWithdrawals[creator] (via ERC-2981)
    │
    ├── Remainder            ──→  pendingWithdrawals[seller]
    │
    └── Excess ETH refund    ──→  pendingWithdrawals[buyer]

All recipients call withdraw() to claim their funds (pull-payment).
```

### 2.4 PriceOracle.sol (Economic-Incentive Oracle)

```
┌─────────────────────────────────────────────────────┐
│                   PriceOracle                        │
│         (ASTREA-inspired, Chainlink-compatible)      │
│─────────────────────────────────────────────────────│
│ Inherits:                                           │
│  └─ Ownable         (admin controls)                │
│─────────────────────────────────────────────────────│
│ Custom Errors (10):                                 │
│  NotAuthorizedReporter, StalePrice,                 │
│  AlreadySubmitted, NoPrice, PriceDeviationTooHigh,  │
│  RoundTooFrequent, InsufficientStake,               │
│  NoStakeToWithdraw, UnstakeDuringRound,             │
│  TransferFailed                                     │
│─────────────────────────────────────────────────────│
│ Staking & Slashing:                                 │
│  reporterStakes   : mapping(address → uint256)      │
│  slashedFundsPool : uint256                         │
│  MIN_STAKE        : 0.05 ETH                        │
│  SLASH_THRESHOLD  : 1000 BPS (10% deviation)        │
│  SLASH_PENALTY    : 2000 BPS (20% of stake)         │
│─────────────────────────────────────────────────────│
│ State:                                              │
│  reporters         : mapping(address → bool)        │
│  currentRound      : uint256                        │
│  latestRound       : PriceRound{price,ts,count}     │
│  priceHistory      : circular buffer (MAX=10)       │
│  minRoundInterval  : uint256 (flash-loan guard)     │
│  emergencyPriceActive : bool                        │
│  reporterSubmissions : mapping(address → uint256)   │
│─────────────────────────────────────────────────────│
│ Staking Functions:                                  │
│  + stake() [payable, onlyReporter]                  │
│    → MIN_STAKE required before submitting            │
│  + unstake(amount) [no mid-round unstaking]          │
│  + claimSlashedFunds() [onlyOwner]                  │
│─────────────────────────────────────────────────────│
│ Price Functions:                                    │
│  + submitPrice(price) [staked reporters only]        │
│    → checks stake ≥ MIN_STAKE                       │
│    → on finalization: slash outliers >10% deviation  │
│  + getLatestPrice() → (price, timestamp)            │
│  + getLatestPriceUnsafe() → (price, ts, reporters)  │
│  + getPriceHistory() → PriceRound[]                 │
│  + getVolatility() → (bps, count)                   │
│  + getTWAP() → (twapPrice, count)                   │
│  + emergencySetPrice(price) [onlyOwner]             │
│  + setMinRoundInterval(seconds) [onlyOwner]          │
│  + forceAdvanceRound() [onlyOwner]                  │
│─────────────────────────────────────────────────────│
│ Chainlink AggregatorV3 Interface:                   │
│  + latestRoundData() → (roundId, answer,             │
│      startedAt, updatedAt, answeredInRound)          │
│  + decimals() → 8                                   │
│  + description() → "ETH/USD"                        │
│  + version() → 1                                    │
│    → enables zero-code migration to Chainlink        │
└─────────────────────────────────────────────────────┘
```

**Design Decisions:**
- **Economic-incentive staking (ASTREA-inspired)**: Reporters must stake ≥ 0.05 ETH before submitting prices. This creates skin-in-the-game — reporters who stake are incentivized to report honestly because their capital is at risk.
- **Slashing mechanism**: After each round finalizes, every reporter's submission is checked against the median. If deviation exceeds 10% (SLASH_THRESHOLD_BPS = 1000), 20% of their stake is forfeited to the slashed funds pool. This makes lying economically irrational — the cost of being slashed exceeds any potential gain from price manipulation.
- **Chainlink AggregatorV3 compatibility**: Implements `latestRoundData()`, `decimals()`, `description()`, and `version()` matching the Chainlink interface. Any system expecting a Chainlink feed can use this oracle with zero code changes, enabling seamless migration to production Chainlink in deployment.
- **Median aggregation**: Uses the median of submitted prices rather than mean, making it resistant to outlier manipulation by a single bad reporter.
- **Round-based**: Each reporter submits once per round; round finalizes when MIN_REPORTERS (3) have submitted.
- **Staleness check**: `getLatestPrice()` reverts if no fresh price within 1 hour, preventing use of outdated data.
- **Price deviation guard**: Submissions deviating more than 50% from the last finalized price are rejected pre-submission, preventing flash manipulation.
- **TWAP (Time-Weighted Average Price)**: More manipulation-resistant than spot price because transient price spikes have minimal impact on the time-weighted average.
- **Flash-loan attack prevention**: `minRoundInterval` enforces cooldown between rounds, preventing same-block price manipulation.
- **On-chain price history**: Circular buffer of last 10 finalized rounds for trend transparency.
- **Emergency price override**: `emergencySetPrice()` allows the owner to set price when reporters are unavailable.

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
    ├── useOracleContract (wagmi hooks for on-chain PriceOracle)
    ├── Dutch auction hooks: useCreateDutchAuction, useBuyDutchAuction,
    │   useGetDutchAuctionPriceInWei, useCancelDutchAuction, useDutchAuctionCount
    └── Offer hooks: useMakeOffer, useAcceptOffer, useCancelOffer, useOfferCount
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

**Friendly Error Messages** — `errorMessages.js` maps all 37+ contract custom errors and common wallet/transaction errors to bilingual (EN/ZH) user-friendly messages. `getFriendlyError(error, lang)` parses viem/wagmi error strings and returns contextual messages for the TransactionModal.

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

### 4.2 Buy NFT Flow (USD → Oracle → ETH)

```
Buyer         Frontend       Marketplace     Oracle        NFTCollection
  │               │               │               │               │
  │ Click "Buy"   │               │               │               │
  │──────────────>│               │               │               │
  │               │ getListingPriceInWei(id)      │               │
  │               │──────────────>│ getLatestPrice│               │
  │               │               │──────────────>│               │
  │               │               │ (ethUsdPrice) │               │
  │               │               │<──────────────│               │
  │               │ (requiredWei, │               │               │
  │               │  maxWei)      │               │               │
  │               │<──────────────│               │               │
  │               │               │               │               │
  │               │ buyNFT(id) + maxWei           │               │
  │               │──────────────>│               │               │
  │               │               │ _getRequiredWei (oracle call) │
  │               │               │ check slippage (±2%)          │
  │               │               │ royaltyInfo()                 │
  │               │               │────────────────────────────>│
  │               │               │               │  (recv, amt)  │
  │               │               │<────────────────────────────│
  │               │               │ _distributeFunds (pull-pay)   │
  │               │               │ refund excess → buyer         │
  │               │               │ safeTransferFrom              │
  │               │               │────────────────────────────>│
  │               │    Sold event │               │               │
  │               │<──────────────│               │               │
  │  NFT Owned!   │               │               │               │
  │<──────────────│               │               │               │
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
| Bid sniping | MIN_BID_INCREMENT_BPS = 500 (5% minimum increase); ANTI_SNIPE_DURATION extends auction by 5 min on late bids |
| Stale listings | Optional expiration on listings, checked at buy time |
| Oracle manipulation | Median aggregation + staleness checks + 50% deviation guard + staking/slashing in PriceOracle |
| Oracle zero price | `_getRequiredWei` reverts if oracle returns price 0 |
| Oracle zero address | `setOracle` reverts on zero address input |
| Royalty to zero addr | `_distributeFunds` ignores royalty if receiver is address(0) |
| Dutch auction overpay | No `ExcessivePayment` check; excess ETH refunded via pull-payment |
| Expired/inactive offer | `OfferNotActive` and `OfferExpired` errors prevent stale offer acceptance |
| Oracle price feed failure | `emergencySetPrice` allows owner override to keep marketplace operational |
| Flash-loan price manipulation | `minRoundInterval` prevents rapid-fire round finalizations; TWAP provides manipulation-resistant pricing |
| Swap counterparty abuse | `SwapExpired` duration limit, `NotCounterparty` access control, proposer NFT escrowed on proposal |

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
| Price Feed (on-chain PriceOracle) | | X |
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
