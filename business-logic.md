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
2. Seller calls `listNFT(nftContract, tokenId, price, duration)`
   - `duration = 0` means no expiry
   - `duration > 0` sets `expiration = block.timestamp + duration`
3. Listing is stored on-chain with `active = true` and optional expiration
4. NFT remains in seller's wallet (not escrowed)

**Why no escrow for listings?**
- Better UX: seller retains NFT until sold
- Seller can display the NFT in their wallet
- Marketplace checks ownership at buy time

### 2.3 Buying

**Business Rule**: Buyer sends exact listing price. Cannot buy own NFT.

1. Buyer calls `buyNFT(listingId)` with exact ETH amount
2. Contract checks listing has not expired (if expiration > 0)
3. Contract distributes funds via pull-payment (`_distributeFunds`):
   - 2.5% → `pendingWithdrawals[platformOwner]`
   - Royalty % → `pendingWithdrawals[originalCreator]`
   - Remainder → `pendingWithdrawals[seller]`
4. NFT is transferred from seller to buyer
5. Listing marked as inactive
6. All recipients call `withdraw()` to claim their ETH

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
1. First bid: Bidder sends ETH >= start price
2. Subsequent bids: must be >= `highestBid + highestBid * 5%` (MIN_BID_INCREMENT_BPS = 500)
3. Previous highest bidder's funds added to `pendingWithdrawals`
4. New bid becomes the highest

**Ending:**
1. Anyone can call `endAuction()` after `endTime`
2. If bids exist: funds distributed (same as fixed-price), NFT to winner
3. If no bids: NFT returned to seller

**Withdrawal:**
- Outbid users call `withdraw()` to reclaim their ETH
- This is the "pull-over-push" pattern for safety

### 2.5 Cancellation

**Business Rule**: Only the seller can cancel an active listing. Auctions can only be cancelled by the seller if no bids have been placed (to protect bidders). The escrowed NFT is returned to the seller on cancellation.

### 2.6 Update Listing Price

**Business Rule**: Only the seller can update the price of an active listing to a new non-zero value. Emits a `ListingPriceUpdated` event.

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
| Emergency Stop | Pausable |
| Error Handling | 18+ Custom Errors (gas-efficient) |

### 3.2 Gas Optimization

- Custom errors instead of `require()` strings (~200 gas saved per revert)
- `uint96` for royalty fees (packs with address in storage slot)
- Optimizer enabled with 200 runs
- `calldata` for string parameters (cheaper than `memory`)
- Events emitted for off-chain indexing (cheaper than storage)
- `hardhat-gas-reporter` integrated for gas profiling (`REPORT_GAS=true npx hardhat test`)

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
- **Global state** (favorites): Zustand store with `persist` middleware for localStorage persistence
  - `useFavoritesStore`: `favorites[]`, `toggleFavorite(id)`, `isFavorite(id)`
  - Synced across NFTDetail (heart button) and Profile (Favorited tab)
- **On-chain data integration**: Pages use `useAccount()` to detect wallet connection; when connected, hooks like `useAllListings()` and `useUserNFTs()` fetch real blockchain data via multicall; when disconnected, mock data is shown as fallback
- **Skeleton loading**: Reusable skeleton components (`NFTCardSkeleton`, `NFTDetailSkeleton`, `ProfileSkeleton`, `MarketSkeleton`) provide shimmer loading states while blockchain data is fetched
- **Friendly error messages**: `errorMessages.js` maps all 18+ custom contract errors and common wallet/transaction errors to bilingual (EN/ZH) user-friendly messages displayed in the TransactionModal
- **Oracle bridge**: `useOracle` prefers on-chain oracle price data via `useOracleContract` when wallet is connected; falls back to client-side ASTREA simulation when disconnected
- **ESLint**: Flat config (`eslint.config.js`) with `react-hooks` and `react-refresh` plugins for code quality enforcement

---

## 5. Testing Strategy

### 5.1 Smart Contract Tests (72 tests)

**NFTCollection (8 tests):**
- Minting with correct URI and royalty
- Royalty info calculation
- Royalty fee cap enforcement
- Token ID incrementing
- Cross-address minting
- Token enumeration
- Interface support (ERC-165, ERC-721, ERC-2981)
- Creator lookup

**NFTMarketplace — Fixed-Price Listings (10 tests):**
- Listing creation (with and without expiration duration)
- Approval checks
- Price validation (zero price reverts)
- Buy flow with pull-payment fund distribution verification
- Withdrawal of accumulated funds
- Payment validation (incorrect amount reverts)
- Self-purchase prevention
- Listing cancellation by seller
- Non-seller cancellation rejection

**Listing Expiration (4 tests):**
- Duration=0 means no expiry
- Future expiration is buyable
- Expired listing reverts with `ListingExpiredError`
- `isListingExpired` returns correct value

**Auctions (10 tests):**
- Auction creation with NFT escrow
- Bid placement and validation
- Bid below start price rejection
- 5% minimum bid increment enforcement
- Exact boundary (5% increment) accepted
- Outbid refund via pendingWithdrawals
- Auction settlement with fund distribution (pull-payment)
- Return NFT to seller when no bids
- Auction timing enforcement (reject ending before expiry)
- Self-bid prevention

**Pausable (3 tests):**
- Owner can pause and unpause
- Paused marketplace rejects all mutating operations
- Non-owner cannot pause

**Pull-Payment (2 tests):**
- Withdraw zero balance reverts with `NothingToWithdraw`
- Separate royalty receiver and seller both get correct amounts

**Update Listing Price (4 tests):**
- Seller can update listing price (emits `ListingPriceUpdated`)
- Non-seller update rejected
- Update to zero price rejected
- Update on inactive listing rejected

**Cancel Auction (3 tests):**
- Seller can cancel auction with no bids (NFT returned, emits `AuctionCancelled`)
- Non-seller cancellation rejected
- Cancellation rejected when bids exist (protects bidders)

**Withdraw Event (1 test):**
- Withdrawal emits `Withdrawn` event with correct address and amount

**Admin (3 tests):**
- Fee update by owner
- Fee cap enforcement (>10% rejected)
- Non-owner rejection

**SimpleOracle (24 tests):**
- Reporter management (add/remove, authorization, duplicate prevention)
- Price submission (authorized, unauthorized, duplicate prevention)
- Round finalization with median calculation
- Round advancement after finalization
- Staleness check (reverts if >1h, succeeds right before threshold)
- `getLatestPriceUnsafe` works even when stale
- Constant verification (MIN_REPORTERS, STALENESS_PERIOD)
- Multiple rounds: consecutive rounds with price updates, timestamp updates
- Edge cases: outlier price without skewing median, zero price submission, identical prices from all reporters, removed reporter cannot submit, freshly added reporter can submit immediately

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
1. Deploys all 3 contracts (NFTCollection, NFTMarketplace, SimpleOracle)
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

All blockchain-interacting actions (Buy, Bid, List, Mint, Make Offer) show a 4-stage modal:
1. **Wallet Approval** — Waiting for user to confirm in their wallet (`isPending`)
2. **Blockchain Pending** — Transaction submitted, waiting for block confirmation (`isConfirming`); shows real tx hash with Etherscan link
3. **Success** — Green checkmark animation with auto-dismiss (`isSuccess`)
4. **Error** — Red error state with retry option (`error`)

**Dual-mode support**: When wallet is connected, TransactionModal receives real wagmi state (`isPending`, `isConfirming`, `isSuccess`, `error`, `txHash`) from hooks like `useBuyNFT`, `usePlaceBid`, and `useListNFT`. When disconnected, falls back to timer-based simulation for demo purposes.

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

### 7.7 Market Overview Page

A dedicated analytics dashboard at `/market` providing at-a-glance market health, inspired by nftvaluations.com:

**Fear & Greed Gauge**
- SVG half-circle arc gauge with gradient (red → orange → yellow → green)
- Score computed from: 24h volume momentum, average price changes across collections, and sales activity
- Labels: Extreme Fear (0-20), Fear (21-40), Neutral (41-60), Greed (61-80), Extreme Greed (81-100)

**Live Stat Cards** (4 cards, animated)
- Total Market Cap, 24h Volume, 24h Sales, Avg Floor Price
- Values derived from COLLECTIONS data and fluctuate every 4 seconds via `useLiveMarketData` hook
- Each card shows a computed trend badge (green/red %) comparing live value to baseline
- Count-up animation on initial render via `useAnimatedValue` hook (easeOutCubic)

**Collection Rankings**
- Sortable table with 3 tabs: Trend Score, Volume, Floor Price
- Trend Score: weighted combination of 24h change (40%), volume (30%), sales (30%)
- Each row shows: rank, collection image, floor price, 24h %, 7-day sparkline, and sort metric
- Animated row transitions via `AnimatePresence`

**Top Sales Carousel**
- Paginated grid of recent sales from MOCK_GLOBAL_ACTIVITY, sorted by price descending
- Each card links to the NFT detail page

**Market Pulse**
- Horizontal bar chart showing distribution of activity types (Mints, Sales, Listings, Bids, Transfers)
- Animated bar widths using Framer Motion

**Key Insights**
- Most Active Collection (by sales count), Highest Floor, Biggest 24h Decline
- All derived from live COLLECTIONS data

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

## 9. Oracle Price Feed (Decentralized Oracle Demonstration)

### 9.1 Why the Marketplace Needs an Oracle

The Market page displays values in both ETH and USD (e.g., "$389.1M Total Market Cap"). Smart contracts on Ethereum only know ETH values and have no native access to real-world exchange rates. An oracle bridges this gap by providing off-chain data (ETH/USD price) to the application in a verifiable manner.

### 9.2 The Oracle Problem

Relying on a single centralized data source (e.g., one API endpoint) introduces a single point of failure. If that source is compromised, fails, or is manipulated, all dependent price data becomes unreliable. This contradicts blockchain's core principle of decentralization.

### 9.3 Three Aggregation Modes (Interactive Demo)

The Market page includes an interactive Oracle dashboard that demonstrates three approaches:

1. **Centralized Oracle**: Uses only one node (Singapore). Fast but a single point of failure. If the primary node is compromised, the entire price feed fails.

2. **Simple Average**: Arithmetic mean of all 7 node prices. More resilient than single-node, but malicious outliers can significantly skew the average.

3. **ASTREA (Decentralized Oracle)**: Stake-weighted median with outlier detection and economic slashing:
   - 7 independent oracle nodes across global locations (Singapore, Tokyo, New York, London, Frankfurt, Sydney, Sao Paulo)
   - Each node stakes ETH as collateral for honest behavior
   - Stake-weighted median ensures nodes with higher economic commitment have proportional influence
   - Outlier detection flags prices deviating more than 2% from the median
   - Slashing reduces reputation (-5) and stake (-2 ETH) of outlier nodes
   - Nodes with reputation below 30 are permanently slashed (removed)
   - Final consensus = stake-weighted average of non-outlier nodes

### 9.4 ASTREA Algorithm

```
1. Collect prices from all non-slashed nodes
2. Sort prices ascending by value
3. Compute stake-weighted median (50th percentile by cumulative stake)
4. Flag outliers: any price with |deviation| > 2% from median
5. Slash outlier nodes: reputation -= 5, stake -= 2 ETH
6. If reputation < 30: permanently slash (remove) the node
7. Final price = stake-weighted average of remaining valid nodes
8. Confidence = (validStake / totalStake) * 100 * (1 - priceSpread)
```

### 9.5 Integration with Market Page

- The oracle's consensus ETH/USD price replaces the previously hardcoded rate (2091)
- Stat cards showing USD conversion (24h Volume, Avg Floor Price) are tagged with "Oracle Price Feed" badges
- Users can interactively click oracle nodes to toggle them as malicious and observe how each aggregation mode responds
- The SVG price chart visualizes true price vs. consensus price over the last 20 rounds

### 9.6 Oracle Attack Simulator (Guided Interactive Demo)

A step-by-step guided challenge (`OracleAttackSimulator.jsx`) rendered above the Oracle Dashboard on the Market page. Walks users through attacking the oracle and seeing ASTREA defend.

**Step 1 — Centralized Failure**
- Instruction: Switch to Centralized mode, click the Singapore node to make it malicious
- Completion condition: `mode === "centralized"` AND `nodes[0].status === "malicious"`
- Lesson: Single point of failure collapses the entire price feed

**Step 2 — Average Vulnerability**
- Instruction: Switch to Simple Average mode, make 2+ nodes malicious
- Completion condition: `mode === "average"` AND `maliciousCount >= 2`
- Lesson: Naive averaging is vulnerable to outlier manipulation

**Step 3 — ASTREA Defense**
- Instruction: Switch to ASTREA mode with malicious nodes still active
- Completion condition: `mode === "astrea"` AND `maliciousCount >= 2`
- Lesson: Stake-weighted median + slashing maintains high accuracy even under attack

**Technical Implementation:**
- Completion detection and auto-advance timer are separated into two independent `useEffect` hooks to prevent a cleanup race condition (the completion `useEffect` was previously clearing its own timers when `setCompleted` triggered a re-render)
- `useEffect` watches `oracleState` (mode, nodes, accuracy) and auto-detects step completion
- Captures accuracy snapshots at each step for before/after comparison
- Auto-advances to next step after 3s countdown with animated SVG countdown ring
- Quick Action buttons embedded in each step panel eliminate scroll-to-interact UX friction
- Live condition checklist tracks real-time sub-condition status (checkmarks appear as conditions are met)
- Live accuracy meters show real-time Centralized/Average/ASTREA accuracy during each step
- Final summary shows 3-column accuracy comparison with animated bars and key takeaway
- Collapsible card with stepper progress bar (inactive → pulsing active → completed checkmark)

### 9.7 Oracle Service Bug Fixes

Three bugs were identified and fixed in `oracleService.js`:

1. **Slashed node reset** (`toggleMalicious`): Previously capped restored reputation/stake below original values using `Math.min(60, ...)`. Fixed to fully restore `node.originalReputation` and `node.originalStake`.

2. **Centralized fallback** (`aggregateCentralized`): Previously fell back to the slashed primary node's stale price. Fixed to search for the first non-slashed node; if none found, returns `INITIAL_TRUE_PRICE` with confidence 0.

3. **Outlier detection clarity** (`aggregateASTREA`): Refactored to explicit relative deviation form: `Math.abs(price - median) / median > OUTLIER_THRESHOLD` for improved readability.

### 9.8 On-Chain SimpleOracle Contract

In addition to the client-side oracle simulation, the project includes a real Solidity contract (`SimpleOracle.sol`) deployed alongside the marketplace:

- **Authorized reporters** submit prices; the owner adds/removes reporters
- When `MIN_REPORTERS` (3) submit in a round, the round finalizes with the **median** price
- `getLatestPrice()` reverts if price is older than 1 hour (staleness protection)
- `getLatestPriceUnsafe()` returns stale data without reverting (for UI display)
- Frontend hook `useOracleContract.js` provides `useLatestPrice()`, `useLatestPriceUnsafe()`, `useSubmitPrice()` via wagmi

### 9.9 Key Files

| File | Purpose |
|------|---------|
| `frontend/src/services/oracleService.js` | Pure JS oracle simulation engine (7 nodes, 3 aggregation modes) |
| `frontend/src/hooks/useOracle.js` | React hook wrapping the service with 3.5s update interval |
| `frontend/src/components/oracle/OracleDashboard.jsx` | Visual dashboard: mode selector, node grid, SVG chart, result comparison |
| `frontend/src/components/oracle/OracleAttackSimulator.jsx` | Guided 3-step attack simulation walkthrough |
| `frontend/src/components/oracle/OracleEducationPanel.jsx` | Bilingual (EN/ZH) educational content explaining Oracle Problem & ASTREA |
| `contracts/contracts/SimpleOracle.sol` | On-chain multi-reporter median oracle price feed |
| `frontend/src/hooks/useOracleContract.js` | wagmi hooks for reading/writing SimpleOracle contract |

---

## 10. UI/UX Improvements (Round 4)

### 10.1 Activity Page Enhancements
- **Real-time event simulation**: New random marketplace events (mints, sales, bids, listings, transfers) are generated and prepended every 6 seconds via `setInterval`, making the "Live" indicator meaningful
- **Time-range filter**: Button group (`1H` / `24H` / `7D` / `All`) filters events by timestamp, complementing the existing event-type dropdown
- **Dead code removal**: Removed unused `loading` state and unreachable skeleton branch

### 10.2 Explore Page Enhancements
- **Search debounce (300ms)**: Split into `searchInput` (immediate keystroke feedback) and `search` (debounced filtering) states using `useRef` timer, preventing excessive re-renders during fast typing
- **Improved empty state**: Card with search icon, helpful message, "Clear All Filters" and "Create an NFT" action buttons replacing plain text
- **Dead code removal**: Removed unused `loading` state and skeleton branch

### 10.3 Collection Page Enhancement
- **Sort dropdown**: Added `itemSort` state (`default` / `price-low` / `price-high`) with `useMemo`-sorted NFT list and a styled `<select>` next to the Items heading

### 10.4 Accessibility Fixes
- **Navbar**: Added `aria-label="Search NFTs"` to both desktop and mobile search inputs
- **Footer**: Added `target="_blank" rel="noopener noreferrer"` to Resources section external links for proper security

### 10.5 Shared Animation System
- **`utils/animations.js`**: Exports reusable Framer Motion variants (`pageVariants`, `fadeUp`, `stagger`, `overlayVariants`, `modalVariants`) used across multiple pages
- Eliminates variant duplication and ensures consistent animation timing across the application

### 10.6 Code Quality Fixes
- **TransactionModal**: Fixed stale closure risk by wrapping `onComplete`, `onClose`, `simulateError` callbacks in `useRef` wrappers
- **Market.jsx**: Fixed `useAnimatedValue` to animate from previous value (not 0), fixed `salesTrend` sign logic, extracted `KeyInsights` component with `useMemo`
- **Create.jsx**: Moved inline `<style>` tag to CSS file, added `isMountedRef` unmount protection
- **NFTDetail.jsx / Profile.jsx**: Fixed clipboard `.writeText()` with `.then()/.catch()` error handling, added null-safe address truncation
- **Home.jsx**: Extracted magic numbers to named constants, added `aria-label` to carousel buttons

---

## 11. Accessibility & Responsive Design (Round 5)

### 11.1 Responsive Carousel
- Home page featured NFT carousel uses `useCardsPerPage()` hook: 1 card on mobile (<640px), 2 on tablet (<1024px), 4 on desktop
- Cards use `w-full` instead of fixed width, carousel uses CSS grid with percentage-based transforms

### 11.2 Accessibility
- **TransactionModal**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap (Tab key cycles within modal), Escape key closes
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables all CSS animations/transitions globally
- **ARIA labels**: Search inputs, carousel buttons, and interactive elements have descriptive `aria-label` attributes

### 11.3 Global Favorites (Zustand)
- `useFavoritesStore` with `persist` middleware stores favorites in localStorage
- NFTDetail heart button: `toggleFavorite(nft.id)`, visual state from `isFavorite(nft.id)`
- Profile Favorited tab: reads from store instead of mock data

---

## 12. Future Enhancements

- **Lazy minting**: Mint at purchase time to save gas
- **The Graph indexing**: Event-based indexing for faster queries
- **IPFS pinning service**: Extend Pinata integration with pin management and garbage collection
- **Multi-chain support**: Deploy on Polygon, Arbitrum for lower fees
- **Collection creation UI**: Allow users to create and manage their own collections
- **Advanced search**: Full-text search, trait-based filtering, price range queries
- ~~**Watchlist / Favorites**: Persistent favorites synced with wallet address~~ (Implemented via Zustand)
