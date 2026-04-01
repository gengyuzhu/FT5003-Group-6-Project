# NFT Marketplace — Business Logic & Technical Implementation

**FT5003 Blockchain Innovations — NUS**

---

## 1. Business Model

### Target Market — Traditional Artists
Unlike OpenSea and other existing marketplaces, this platform specifically targets **traditional artists** entering the NFT space for the first time. These artists think in fiat currencies (USD), not ETH. By allowing sellers to list NFTs in USD and using an on-chain oracle to convert to ETH at purchase time, the platform eliminates crypto-volatility risk for sellers and provides a familiar pricing experience.

### Revenue Model
- **Platform Fee**: 2.5% on every sale (configurable by contract owner, max 10%)
- **Creator Royalties**: 0–10% on secondary sales, enforced via ERC-2981

### User Roles

| Role | Actions |
|------|---------|
| **Creator** | Mint NFTs, set royalties, earn on resales |
| **Seller** | List NFTs (fixed price, English auction, or Dutch auction), cancel listings, accept offers, propose/cancel swaps |
| **Buyer** | Buy listed NFTs, place bids on auctions, buy Dutch auctions, make/cancel offers, accept swaps |
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
- Token ID auto-increments from 1
- Gas cost: ~150,000 gas

### 2.2 Fixed-Price Listing (USD-Denominated)

**Business Rule**: Only the NFT owner can list. Must approve marketplace first. Prices are in USD cents for price stability — oracle converts to ETH at purchase time.

1. Seller approves marketplace contract for the token
2. Seller calls `listNFT(nftContract, tokenId, priceUsdCents, duration)`
   - `priceUsdCents` is in USD cents (e.g., 10000 = $100.00)
   - `duration = 0` means no expiry
   - `duration > 0` sets `expiration = block.timestamp + duration`
3. Listing is stored on-chain with `active = true`, `priceUsdCents`, and optional expiration
4. NFT remains in seller's wallet (not escrowed)

**Why no escrow for listings?**
- Better UX: seller retains NFT until sold
- Seller can display the NFT in their wallet
- Marketplace checks ownership at buy time

### 2.3 Buying (Oracle-Based ETH Conversion)

**Business Rule**: Buyer sends ETH equivalent to the USD listing price (converted via oracle at purchase time). 2% slippage tolerance. Cannot buy own NFT.

**Full Flow**: Seller lists in USD → Oracle provides ETH/USD rate → Buyer pays in ETH → Smart contract settles

1. Frontend calls `getListingPriceInWei(listingId)` to get `requiredWei` and `maxWei` (= requiredWei + 2% slippage)
2. Buyer calls `buyNFT(listingId)` with `value = maxWei`
3. Contract calls `_getRequiredWei(priceUsdCents)`:
   - Reads oracle: `(oraclePrice, timestamp) = oracle.getLatestPrice()`
   - Converts (rounds up): `requiredWei = ceil(priceUsdCents × 1e24 / oraclePrice)`
4. Contract checks: `requiredWei ≤ msg.value ≤ requiredWei + 2%` (reverts `InsufficientPayment` or `ExcessivePayment`)
5. Contract distributes `requiredWei` via pull-payment (`_distributeFunds`):
   - 2.5% → `pendingWithdrawals[platformOwner]`
   - Royalty % → `pendingWithdrawals[originalCreator]`
   - Remainder → `pendingWithdrawals[seller]`
6. Excess ETH (msg.value - requiredWei) → `pendingWithdrawals[buyer]`
7. NFT is transferred from seller to buyer
8. Listing marked as inactive
9. All recipients call `withdraw()` to claim their ETH

**Fund Distribution Example** ($2091 listing at $2091/ETH rate, 5% royalty):
```
Listing:  $2,091.00 USD = 1.000 ETH (at oracle rate)
Platform: 0.025 ETH (2.5%)
Royalty:  0.050 ETH (5.0%)
Seller:   0.925 ETH (92.5%)
Buyer refund: excess ETH above requiredWei (if any)
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

**Business Rule**: Only the seller can cancel an active listing. Auctions can only be cancelled by the seller if no bids have been placed (to protect bidders). The escrowed NFT is returned to the seller on cancellation. Note: `cancelAuction` works even when the marketplace is paused, so sellers can always recover their NFTs in an emergency.

### 2.6 Update Listing Price

**Business Rule**: Only the seller can update the USD price of an active listing to a new non-zero value. Emits a `ListingPriceUpdated` event with old and new prices in USD cents.

### 2.7 Batch Listing

**Business Rule**: A seller can list up to `MAX_BATCH_SIZE` (20) NFTs in a single transaction. All four input arrays (NFT contracts, token IDs, USD prices, durations) must have equal length; mismatches revert with `ArrayLengthMismatch()`. Exceeding 20 items reverts with `BatchTooLarge()`.

1. Seller approves the marketplace for each token to be listed
2. Seller calls `batchListNFT(nftContracts[], tokenIds[], pricesUsdCents[], durations[])`
3. The function iterates the arrays and calls the internal `_createListing()` helper for each entry — the same helper used by the single-item `listNFT()`, keeping logic consistent and auditable
4. All created listing IDs are collected and emitted in a single `BatchListed(listingIds, seller)` event
5. Returns the array of new listing IDs

**Why batch listing matters**: Listing individual NFTs one by one requires N separate transactions, N wallet confirmations, and N gas payments. Batch listing collapses this into one transaction, dramatically reducing cost and friction for sellers with large inventories. OpenSea does not offer on-chain batch listing; this is a deliberate platform differentiator.

**New custom errors introduced**: `ArrayLengthMismatch()`, `BatchTooLarge()`

### 2.8 Anti-Snipe Auction Extension

**Business Rule**: To prevent last-second bid sniping (common on OpenSea and eBay-style auctions), any bid placed within `ANTI_SNIPE_DURATION` (5 minutes) of the auction end time automatically extends the auction by 5 minutes.

**Detection and extension flow** (within `placeBid`):
1. Bidder places a valid bid (passes all amount and timing checks)
2. Contract checks: `block.timestamp >= auction.endTime - ANTI_SNIPE_DURATION`
3. If true: `auction.endTime += ANTI_SNIPE_DURATION`; emits `AuctionExtended(auctionId, newEndTime)`
4. The extension can repeat as many times as snipe bids keep arriving — there is no cap on total extensions

**Why this matters**: Without anti-snipe protection, bidders can watch an auction countdown and submit a winning bid in the final seconds, leaving other participants no time to respond. The 5-minute rolling extension ensures all interested bidders have a fair window after every late bid. The `AuctionExtended` event allows frontends and off-chain indexers to update countdown timers in real time.

### 2.9 Platform Differentiators vs OpenSea

The marketplace supports **8 sale mechanisms** compared to OpenSea's 2 (fixed-price + English auction):

| Mechanism | This Marketplace | OpenSea |
|-----------|:---------------:|:-------:|
| Fixed-Price Listing (USD via oracle) | Yes | Partial (ETH/USD, no on-chain oracle) |
| English Auction (anti-snipe) | Yes | Yes |
| Dutch Auction (declining price, USD via oracle) | Yes | No |
| On-Chain Offers (ETH escrowed, fully transparent) | Yes | No (off-chain Seaport orders) |
| P2P NFT Swaps (atomic bartering + ETH top-up) | Yes | No |
| Batch Listing (on-chain, up to 20 NFTs) | Yes | No |

### 2.10 Oracle Price History

**Business Rule**: `PriceOracle` now records the last 10 finalized round prices on-chain, giving buyers and sellers transparent access to recent price trends without relying on off-chain indexers.

**Implementation:**
- A circular `priceHistory` buffer (capped at `MAX_HISTORY = 10`) is maintained in contract storage
- Each time a round finalizes (i.e., `MIN_REPORTERS` have submitted and the median is computed), the finalized price and its timestamp are appended to the buffer, overwriting the oldest entry when the buffer is full
- `getPriceHistory()` returns the full array of stored `PriceEntry` structs (price + timestamp)
- `getPriceHistoryLength()` returns the count of populated entries (up to 10)

**Value for users**: Sellers can verify the oracle has been stable before listing at a specific USD price. Buyers can see whether the current ETH/USD rate is an outlier or within a normal recent range, making it easier to decide whether to buy now or wait.

### 2.11 Dutch Auction (Declining Price, USD-Denominated)

**Business Rule**: A seller creates a Dutch auction with a start and end USD price over a fixed duration. The price decreases linearly over time. The first buyer to transact wins at the current oracle-converted price. Commonly used in IPOs and bond markets; OpenSea does not offer this mechanism.

**Creating:**
1. Seller approves marketplace for the token
2. Seller calls `createDutchAuction(nftContract, tokenId, startPriceUsdCents, endPriceUsdCents, duration)`
   - `endPriceUsdCents` must be less than `startPriceUsdCents` (reverts `EndPriceTooHigh` otherwise)
   - NFT is transferred to marketplace (escrowed)
3. `DutchAuctionCreated` event emitted

**Current Price Calculation:**
```
elapsed    = block.timestamp - startTime
duration   = endTime - startTime
priceRange = startPriceUsdCents - endPriceUsdCents
currentUsdCents = startPriceUsdCents - (priceRange * elapsed / duration)
```
Oracle converts `currentUsdCents` → ETH via `_getRequiredWei()`.

**Buying:**
1. Frontend calls `getDutchAuctionPriceInWei(id)` to get the current required ETH
2. Buyer calls `buyDutchAuction(id)` with sufficient ETH
3. No `ExcessivePayment` check is enforced — buyers are expected to send more than the exact amount as the price declines; excess is refunded via `pendingWithdrawals[buyer]`
4. `_distributeFunds` distributes proceeds (platform fee, royalty, seller payment)
5. NFT transferred to buyer; auction marked `sold = true`
6. `DutchAuctionSold` event emitted

**Cancelling:**
- Seller can cancel before any purchase: `cancelDutchAuction(id)` returns the escrowed NFT to the seller and emits `DutchAuctionCancelled`
- Reverts with `DutchAuctionEnded` if the auction has already sold or expired

**New errors**: `EndPriceTooHigh()`, `DutchAuctionEnded()`
**New events**: `DutchAuctionCreated`, `DutchAuctionSold`, `DutchAuctionCancelled`

### 2.12 On-Chain Offer System (ETH Escrowed)

**Business Rule**: Any buyer can make a binding ETH offer on any NFT — whether listed, in auction, or unlisted. ETH is locked on-chain immediately, making every offer fully transparent and enforceable. Unlike OpenSea's off-chain Seaport orders, no off-chain signing is required and funds are never hidden.

**Making an Offer:**
1. Buyer calls `makeOffer(nftContract, tokenId, expiration)` with ETH attached
2. ETH is held in contract storage (tracked via the `Offer` struct)
3. `OfferMade` event emitted; multiple offers can exist for the same NFT

**Accepting an Offer:**
1. NFT owner calls `acceptOffer(offerId)`
2. Contract validates offer is active and not expired (reverts `OfferExpired` if past expiration)
3. `_distributeFunds` distributes `offer.amount` (platform fee, royalty, seller payment)
4. NFT transferred from owner to buyer via `safeTransferFrom`
5. Offer marked inactive; `OfferAccepted` event emitted

**Cancelling an Offer:**
1. Buyer calls `cancelOffer(offerId)`
2. Contract validates offer is active (reverts `OfferNotActive` otherwise)
3. `offer.amount` credited to `pendingWithdrawals[buyer]`; buyer calls `withdraw()` to reclaim ETH
4. `OfferCancelled` event emitted

**New errors**: `OfferNotActive()`, `OfferExpired()`
**New events**: `OfferMade`, `OfferAccepted`, `OfferCancelled`

### 2.13 P2P NFT Swaps (Atomic Bartering)

**Business Rule**: Two users can propose and execute an atomic swap of NFTs directly, optionally with an ETH "sweetener" to compensate for value differences. This is the oldest form of trade — bartering — reinvented on blockchain with atomic execution guarantees.

**Propose Swap Flow:**
1. Proposer specifies: counterparty address, their own NFT (contract + tokenId), counterparty's desired NFT (contract + tokenId), duration, and optional ETH top-up
2. Proposer's NFT is transferred (escrowed) into the marketplace contract
3. Any ETH sent (top-up) is held in the contract
4. `SwapProposed` event emitted

**Accept Swap Flow:**
1. Counterparty calls `acceptSwap(swapId)` — only the designated counterparty can accept
2. Both NFTs are swapped atomically: proposer's NFT → counterparty, counterparty's NFT → proposer
3. If ETH top-up exists, funds are distributed via `_distributeFunds` using the counterparty's NFT for royalty calculation (platform fee → owner, royalty → creator, remainder → counterparty)
4. `SwapExecuted` event emitted

**Cancel Swap Flow:**
1. Only the proposer can cancel an active swap
2. Proposer's escrowed NFT is returned
3. Any ETH top-up is refunded via `pendingWithdrawals`
4. `SwapCancelled` event emitted

**New errors**: `SwapNotActive()`, `NotCounterparty()`, `SwapExpired()`
**New events**: `SwapProposed`, `SwapExecuted`, `SwapCancelled`

### 2.14 Oracle Advanced Features

**Emergency Price Override:**
- `emergencySetPrice(price)` [onlyOwner] — sets the oracle price instantly, bypassing reporter consensus and the normal round process
- `emergencyPriceActive` bool is set to `true`; subsequent normal round finalization clears it, restoring decentralized aggregation
- `EmergencyPriceSet` event emitted
- Use case: oracle reporters become unavailable and the marketplace would otherwise be stuck with a stale price

**Reporter Submission Tracking:**
- `reporterSubmissions` mapping records the cumulative number of rounds each reporter has participated in
- Incremented on each successful `submitPrice()` call
- Provides an on-chain audit trail for reporter activity

**On-Chain Volatility:**
- `getVolatility()` view function computes price volatility from the stored `priceHistory` buffer: `(max - min) * 10000 / avg`, returned in basis points
- A result of `500` means the price range over the history window is 5% of the average
- Useful for sellers assessing whether the oracle has been stable before listing, and for buyers checking if the current rate is an outlier

**TWAP (Time-Weighted Average Price):**
- `getTWAP()` calculates a time-weighted average from the `priceHistory` circular buffer
- Each price is weighted by its duration (time interval until the next price update); the last entry is weighted until `block.timestamp`
- More manipulation-resistant than spot price because transient price spikes have minimal impact on the time-weighted average
- Formula: `twapPrice = Σ(price_i × duration_i) / Σ(duration_i)`
- Reverts with `NoPrice` if no price history exists; returns the single price if only one entry

**Flash-Loan Attack Prevention:**
- `minRoundInterval` is an owner-settable minimum interval between round finalizations (default 0 = disabled)
- `setMinRoundInterval(seconds)` configures the guard; `_finalizeRound` checks the interval and reverts with `RoundTooFrequent` if rounds are finalized too rapidly
- Prevents same-block or rapid-fire price manipulation via flash loans, where an attacker could submit multiple prices within a single transaction to manipulate the oracle price

### 2.15 NFT Rental (ERC-4907)

**Business Rule**: NFT owners can list their NFTs for rent. Renters get time-limited "usage rights" without the NFT leaving the owner's wallet. OpenSea does not support NFT rentals at all.

**How it works:**
1. Owner calls `listForRent(nftContract, tokenId, dailyPriceUsdCents, maxDays)` — NFT stays in owner's wallet (no escrow)
2. Renter calls `rentNFT(rentalId, days)` with ETH payment — marketplace calls `IERC4907.setUser(tokenId, renter, expires)` on the NFT contract
3. The "user" role expires automatically at the timestamp; `userOf(tokenId)` returns `address(0)` after expiry
4. On NFT transfer, user info is automatically cleared (ERC-4907 standard behavior)
5. Funds distributed via `_distributeFunds` (platform fee + royalty + owner proceeds)
6. Completed rental recorded as `CompletedTx` (type=5) for reputation system

**New errors**: `RentalListingNotActive()`, `RentalDurationInvalid()`
**New events**: `RentalListed`, `NFTRented`, `RentalCancelled`

### 2.16 Collaborative Minting

**Business Rule**: Multiple creators can co-mint a single NFT with on-chain share allocation. When the NFT generates royalties on secondary sales or rentals, each creator receives their proportional share automatically.

**Mint Flow:**
1. Caller provides `creators[]` and `sharesBps[]` arrays — shares must sum to exactly 10000 (100%)
2. NFT is minted with royalty receiver set to the NFT contract itself (not individual creator)
3. `CollabInfo` stored on-chain: creator addresses + share percentages
4. `isCollaborative[tokenId]` set to `true`

**Royalty Distribution Flow:**
1. When a collaborative NFT is sold/rented, the marketplace calls `_distributeFunds` which detects `isCollaborative == true`
2. Instead of adding royalty to `pendingWithdrawals[nftContract]`, marketplace calls `NFTCollection.distributeRoyalty{value: royaltyAmount}(tokenId)`
3. `distributeRoyalty` splits incoming ETH among all creators based on their share BPS
4. Each creator's share is added to `pendingCreatorPayments[creator]` (pull-payment)
5. Creators call `withdrawCreatorPayment()` to claim

**New errors**: `EmptyCreators()`, `SharesLengthMismatch()`, `InvalidSharesTotal()`, `NoRoyaltyToDistribute()`, `CreatorTransferFailed()`

### 2.17 On-Chain Reputation System

**Business Rule**: Every completed transaction (across all 8 sale types) automatically records a `CompletedTx` entry. Both buyer and seller can rate each other once (score 1–5). Ratings are permanent, immutable, and on-chain. This solves the "rug pull seller" problem that OpenSea cannot address.

**Rating Flow:**
1. After any sale completes (fixed-price, auction, Dutch, offer, swap, rental), `_recordTx()` creates a `CompletedTx` with buyer, seller, NFT details, transaction type, and timestamp
2. Either party calls `rateTransaction(txId, score)` with a score from 1 to 5
3. The counterparty's `reputationScore` is incremented by the score; `ratingCount` is incremented by 1
4. `getReputation(user)` returns `avgScore100` (average × 100 for precision) and `totalRatings`
5. Double-rating is prevented by `txRatings[txId][rater]` check

**Transaction Types**: 0=fixed-price, 1=auction, 2=Dutch, 3=offer, 4=swap, 5=rental

**New errors**: `AlreadyRated()`, `InvalidRating()`, `NotTxParticipant()`, `TxNotFound()`
**New events**: `TransactionCompleted`, `TransactionRated`

### 2.18 PriceOracle: Economic-Incentive Staking & Slashing

**Business Rule**: Reporters must stake ETH to participate in price reporting. This creates economic alignment — honest reporting is rewarded (keep stake), dishonest reporting is punished (slashed). Design inspired by the ASTREA protocol.

**Staking Mechanism:**
1. Reporter calls `stake()` with ETH — minimum 0.05 ETH required to submit prices
2. `unstake(amount)` withdraws stake, but reverts if reporter has already submitted in the current round (prevents gaming)
3. `reporterStakes[reporter]` tracks each reporter's current stake

**Slashing Mechanism:**
1. After each round finalizes and median is computed, every reporter's submission is checked
2. If `|reportedPrice - median| > median × 10%` (SLASH_THRESHOLD_BPS = 1000), the reporter is slashed
3. Slash amount = 20% of reporter's stake (SLASH_PENALTY_BPS = 2000)
4. Slashed funds accumulate in `slashedFundsPool`
5. Owner calls `claimSlashedFunds()` to withdraw
6. `ReporterSlashed` event emitted with details

**Economic Rationale**: The cost of being slashed (20% of stake, minimum 0.01 ETH per round) exceeds any potential gain from price manipulation, making dishonesty irrational.

### 2.19 PriceOracle: Chainlink AggregatorV3 Compatibility

**Business Rule**: The PriceOracle implements the Chainlink AggregatorV3 interface, enabling zero-code migration to production Chainlink feeds.

**Interface:**
- `latestRoundData()` → (roundId, answer, startedAt, updatedAt, answeredInRound) — matches Chainlink format exactly
- `decimals()` → 8 (same as Chainlink ETH/USD feed)
- `description()` → "ETH/USD"
- `version()` → 1

**Migration Path**: In production, replace the PriceOracle address with a Chainlink ETH/USD feed address. The marketplace's `ISimpleOracle.getLatestPrice()` interface remains the same (PriceOracle implements this interface), so no marketplace code changes are needed.

---

## 3. Smart Contract Implementation Details

### 3.1 Solidity Version & Standards

| Component | Standard/Version |
|-----------|-----------------|
| Solidity | 0.8.28 |
| EVM Target | Cancun |
| NFT Standard | ERC-721 (OpenZeppelin v5) |
| Royalty Standard | ERC-2981 |
| Rental Standard | ERC-4907 (time-limited user role) |
| Enumeration | ERC-721 Enumerable |
| Access Control | Ownable |
| Security | ReentrancyGuard |
| Emergency Stop | Pausable |
| Error Handling | 54 Custom Errors (37 marketplace + 10 oracle + 7 NFTCollection) |
| Oracle Integration | IPriceOracle interface for USD→ETH conversion |
| Oracle Compatibility | Chainlink AggregatorV3 Interface |

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
- **List for Sale Modal**: Price input (USD), listing type toggle (Fixed Price / Auction), and confirmation flow triggering the TransactionModal

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
- `useBatchListNFT()` → returns `{ batchList, isPending, isConfirming, isSuccess }`
- `useCreateDutchAuction()` → returns `{ createDutchAuction, isPending, isConfirming, isSuccess }`
- `useBuyDutchAuction()` → returns `{ buyDutchAuction, isPending, isConfirming, isSuccess }`
- `useGetDutchAuctionPriceInWei()` → returns current ETH price for a Dutch auction
- `useCancelDutchAuction()` → returns `{ cancelDutchAuction, isPending, isConfirming, isSuccess }`
- `useDutchAuctionCount()` → returns total Dutch auction count
- `useMakeOffer()` → returns `{ makeOffer, isPending, isConfirming, isSuccess }`
- `useAcceptOffer()` → returns `{ acceptOffer, isPending, isConfirming, isSuccess }`
- `useCancelOffer()` → returns `{ cancelOffer, isPending, isConfirming, isSuccess }`
- `useOfferCount()` → returns total offer count
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
- **Friendly error messages**: `errorMessages.js` maps all 37+ custom contract errors and common wallet/transaction errors to bilingual (EN/ZH) user-friendly messages displayed in the TransactionModal
- **Oracle bridge**: `useOracle` prefers on-chain oracle price data via `useOracleContract` when wallet is connected; falls back to client-side ASTREA simulation when disconnected
- **ESLint**: Flat config (`eslint.config.js`) with `react-hooks` and `react-refresh` plugins for code quality enforcement

---

## 5. Testing Strategy

### 5.1 Smart Contract Tests (197 tests)

**NFTCollection (8 tests):**
- Minting with correct URI and royalty
- Royalty info calculation
- Royalty fee cap enforcement
- Token ID incrementing
- Cross-address minting
- Token enumeration
- Interface support (ERC-165, ERC-721, ERC-2981)
- Creator lookup

**NFTMarketplace — Fixed-Price Listings (10 tests), total Marketplace tests: 126:**
- USD-denominated listing creation (with and without expiration duration)
- Approval checks
- Price validation (zero price reverts)
- Buy flow with oracle ETH conversion + pull-payment fund distribution verification
- Withdrawal of accumulated funds
- Payment validation (insufficient ETH reverts)
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

**Oracle Integration (6 tests):**
- Revert when oracle is not set (`OracleNotSet`)
- Revert when oracle price is stale (`StalePrice`)
- Excess ETH refund to buyer via pendingWithdrawals
- Reject payment exceeding 2% slippage tolerance (`ExcessivePayment`)
- `getListingPriceInWei` returns correct requiredWei and maxWei
- Price change between listing and buying (oracle rate changes → ETH adjusts)

**Batch Listing (5 tests):**
- Successful batch listing of multiple NFTs in a single transaction (emits `BatchListed`)
- `ArrayLengthMismatch` revert when input arrays have different lengths
- `BatchTooLarge` revert when more than 20 NFTs are submitted
- Each created listing is independently buyable after the batch call
- Non-owner NFT inclusion causes revert (ownership check per item)

**Anti-Snipe Auction Extension (4 tests):**
- Bid placed before the anti-snipe window does NOT extend the auction
- Bid placed within the last 5 minutes extends `endTime` by 5 minutes and emits `AuctionExtended`
- Multiple successive snipe bids each trigger another 5-minute extension
- `endAuction` cannot be called until the (extended) `endTime` has passed

**Dutch Auction (10 tests):**
- Successful Dutch auction creation with NFT escrow (emits `DutchAuctionCreated`)
- `EndPriceTooHigh` revert when end price >= start price
- `getDutchAuctionCurrentPrice` returns start price at t=0 and end price at t=duration
- Price decreases linearly at mid-duration
- Successful purchase at current price (emits `DutchAuctionSold`, distributes funds, transfers NFT)
- Excess ETH refunded to buyer via `pendingWithdrawals`
- `DutchAuctionEnded` revert when buying an already-sold or expired auction
- Seller cancels unsold auction (NFT returned, emits `DutchAuctionCancelled`)
- Non-seller cancellation rejected
- `getDutchAuctionCount` returns correct value

**On-Chain Offers (9 tests):**
- Successful offer creation with ETH escrowed (emits `OfferMade`)
- Multiple offers can exist for the same NFT
- NFT owner accepts offer: NFT transfers, funds distributed, `OfferAccepted` emitted
- `OfferExpired` revert when owner tries to accept an expired offer
- `OfferNotActive` revert when accepting an already-cancelled offer
- Buyer cancels offer: ETH credited to `pendingWithdrawals`, `OfferCancelled` emitted
- Non-buyer cancellation rejected
- `getOfferCount` returns correct value
- Offer on an unlisted NFT (owner can still accept)

**Additional Coverage (25 tests):**
- Listing edge cases: non-owner listing, buying cancelled listing, double-cancel
- Auction edge cases: duration bounds (<1h, >7d), zero start price, no approval, non-owner, ended auction double-end, bidding on ended/expired auctions
- Anyone can call endAuction
- cancelAuction works when contract is paused (seller NFT recovery)
- Admin: non-owner setOracle rejected, zero-address oracle rejected, OracleUpdated event, PlatformFeeUpdated event, MAX_FEE boundary
- View helpers: getListingCount, getAuctionCount return correct values
- Withdraw works when paused
- Oracle zero price reverts with OracleNotSet
- Oracle price deviation check rejects extreme prices (>50% deviation)
- Oracle hasSubmitted returns correct status
- Oracle forceAdvanceRound resets round state
- Oracle forceAdvanceRound restricted to owner

**PriceOracle (24 tests):**
- Reporter management (add/remove, authorization, duplicate prevention)
- Price submission (authorized, unauthorized, duplicate prevention)
- Round finalization with median calculation
- Round advancement after finalization
- Staleness check (reverts if >1h, succeeds right before threshold)
- `getLatestPriceUnsafe` works even when stale
- Constant verification (MIN_REPORTERS, STALENESS_PERIOD)
- Multiple rounds: consecutive rounds with price updates, timestamp updates
- Edge cases: outlier price without skewing median, zero price submission, identical prices from all reporters, removed reporter cannot submit, freshly added reporter can submit immediately

**Oracle Price History (4 tests):**
- `getPriceHistory()` returns correct price and timestamp after first round finalization
- History grows across multiple rounds and wraps correctly once the buffer exceeds `MAX_HISTORY` (10)
- `getPriceHistoryLength()` returns the correct count at each stage (0 before any round, up to 10 after wrap)
- Price history entries match the median prices recorded during round finalization

**Oracle Advanced Features (13 tests):**
- `emergencySetPrice` sets price instantly and sets `emergencyPriceActive = true` (emits `EmergencyPriceSet`)
- Non-owner cannot call `emergencySetPrice`
- Normal round finalization after emergency clears `emergencyPriceActive`
- `reporterSubmissions` increments correctly for each reporter on each round
- `reporterSubmissions` is independent per reporter (different submission counts)
- `getVolatility()` returns 0 when price history has fewer than 2 entries
- `getVolatility()` returns correct basis-point volatility across multiple finalized rounds
- `getVolatility()` reflects updated values as new rounds finalize
- TWAP returns time-weighted average across multiple price history entries
- TWAP reverts with `NoPrice` when no price history exists
- `minRoundInterval` prevents rapid round finalization (reverts `RoundTooFrequent`)
- `minRoundInterval` allows finalization after the cooldown period has passed
- `setMinRoundInterval` restricted to owner (non-owner reverts)

**P2P NFT Swaps (9 tests):**
- Successful pure NFT-for-NFT swap proposal (no ETH top-up; NFT escrowed; emits `SwapProposed`)
- Successful swap proposal with ETH top-up (sweetener stored in swap)
- Atomic swap execution by counterparty (both NFTs exchange owners; emits `SwapExecuted`)
- ETH top-up distribution on acceptance (platform fee + royalty via `_distributeFunds`, remainder to counterparty)
- Non-counterparty acceptance rejected (`NotCounterparty`)
- Expired swap acceptance rejected (`SwapExpired`)
- Proposer cancel reclaims NFT + ETH (NFT returned, ETH to `pendingWithdrawals`; emits `SwapCancelled`)
- Non-proposer cancel rejected (`NotTheSeller`)
- Already-cancelled swap acceptance rejected (`SwapNotActive`)

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
1. Deploys all 3 contracts (NFTCollection, NFTMarketplace, PriceOracle)
2. Links oracle to marketplace via `marketplace.setOracle(oracleAddress)` (waits for tx confirmation)
3. Verifies contracts on Etherscan (Sepolia only)
4. Appends deployment to `contracts/deployments.log` for history tracking
5. Writes addresses to `frontend/src/config/deployed-addresses.json`
6. Copies ABIs to `frontend/src/config/abis/`

---

## 7. Frontend Feature Implementation

### 7.1 Collection Concept

The marketplace distinguishes between **Collections** (groups of thematically related NFTs) and individual **Items** (NFTs). Each collection has:
- Name, description, and banner gradient
- Aggregate stats: total supply, unique owners, floor price, total volume, 24h change
- Dedicated page at `/collection/:slug` showing all items in the collection

The Home page Trending section displays top collections (not individual NFTs), linking to their dedicated pages. This mirrors real-world marketplace conventions (OpenSea, Blur).

### 7.2 Offer System

The on-chain offer system allows any buyer to make a binding ETH offer on any NFT — listed or unlisted:
- ETH is escrowed directly in the contract on `makeOffer()`, making every offer transparent and verifiable on-chain (unlike OpenSea's off-chain Seaport orders)
- Offer modal on NFT detail pages includes amount input and expiration dropdown (1 day, 3 days, 7 days, 30 days)
- Offers tab on NFT detail page displays all active on-chain offers with bidder addresses, amounts, and expiry times
- NFT owner can accept an offer directly from the UI; submitting triggers the TransactionModal flow
- Buyers can cancel their offer at any time to reclaim escrowed ETH via `pendingWithdrawals`

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

### 9.8 On-Chain PriceOracle Contract

In addition to the client-side oracle simulation, the project includes a real Solidity contract (`PriceOracle.sol`) deployed alongside the marketplace:

- **Authorized reporters** submit prices; the owner adds/removes reporters
- When `MIN_REPORTERS` (3) submit in a round, the round finalizes with the **median** price
- `getLatestPrice()` reverts if price is older than 1 hour (staleness protection)
- `getLatestPriceUnsafe()` returns stale data without reverting (for UI display)
- Frontend hook `useOracleContract.js` provides `useLatestPrice()`, `useLatestPriceUnsafe()`, `useSubmitPrice()`, `usePriceHistory()` via wagmi

### 9.9 Key Files

| File | Purpose |
|------|---------|
| `frontend/src/services/oracleService.js` | Pure JS oracle simulation engine (7 nodes, 3 aggregation modes) |
| `frontend/src/hooks/useOracle.js` | React hook wrapping the service with 3.5s update interval |
| `frontend/src/components/oracle/OracleDashboard.jsx` | Visual dashboard: mode selector, node grid, SVG chart, result comparison |
| `frontend/src/components/oracle/OracleAttackSimulator.jsx` | Guided 3-step attack simulation walkthrough |
| `frontend/src/components/oracle/OracleEducationPanel.jsx` | Bilingual (EN/ZH) educational content explaining Oracle Problem & ASTREA |
| `contracts/contracts/PriceOracle.sol` | On-chain multi-reporter median oracle price feed |
| `frontend/src/hooks/useOracleContract.js` | wagmi hooks for reading/writing PriceOracle contract |

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
