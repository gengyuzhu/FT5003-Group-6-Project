# NFT Marketplace

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636?logo=solidity)](https://soliditylang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![Hardhat](https://img.shields.io/badge/Hardhat-fff200?logo=hardhat)](https://hardhat.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A full-stack decentralized NFT marketplace built on Ethereum, supporting minting, fixed-price listings, English auctions, Dutch auctions, on-chain offers, P2P NFT swaps, and on-chain royalty enforcement. Developed as a group project for **FT5003 Blockchain Innovations** at the National University of Singapore (NUS).

---

## Features

### Smart Contract
- **Mint NFTs** - Create ERC-721 tokens with metadata stored on IPFS via Pinata
- **USD-Denominated Listings** - Sellers list NFTs in USD for price stability; the on-chain oracle converts to ETH at purchase time, protecting traditional artists from crypto volatility
- **Fixed-Price Listings** - List NFTs at a set USD price with optional expiration duration; allow instant purchases with oracle-based ETH conversion
- **English Auctions** - Time-bound auctions with real-time countdown timers, competitive bidding, and 5% minimum bid increment
- **Royalty Enforcement** - ERC-2981 royalties applied automatically on every secondary sale
- **Platform Fee** - Configurable marketplace fee (default 2.5%) collected on each transaction
- **Pull-Payment Fund Distribution** - All sale proceeds (platform fee, royalty, seller payment) accumulate in `pendingWithdrawals` for safe withdrawal, eliminating reentrancy and gas-griefing risks
- **Pausable** - Contract owner can pause/unpause all marketplace operations via OpenZeppelin Pausable
- **Update Listing Price** - Sellers can update the price of active listings on-chain
- **Cancel Auction** - Sellers can cancel auctions with no bids and reclaim their escrowed NFT
- **Batch Listing** - `batchListNFT` allows sellers to list multiple NFTs in a single transaction (up to 20 at once); not supported on OpenSea, making this a platform differentiator
- **Anti-Snipe Auction Extension** - Any bid placed within the last 5 minutes of an auction automatically extends the end time by 5 minutes, preventing last-second sniping; can extend multiple times if snipe bids keep arriving
- **Dutch Auction (Declining Price)** - USD-denominated declining-price auction; price decreases linearly from start to end price over the duration; first buyer wins at the current oracle-converted price; NFT escrowed in marketplace; excess ETH refunded via pull-payment; commonly used in IPOs and bond markets — OpenSea does not have this
- **On-Chain Offer System** - Any buyer can make an ETH-escrowed offer on any NFT (even unlisted ones); NFT owner can accept, transferring the NFT and distributing funds via `_distributeFunds`; buyer can cancel and reclaim ETH; multiple offers can coexist per NFT; fully transparent on-chain (unlike OpenSea's off-chain Seaport orders)
- **P2P NFT Swaps (Atomic Bartering)** - Proposer specifies counterparty, both NFT contracts + token IDs, duration, and optional ETH top-up; proposer's NFT is escrowed on proposal; counterparty accepts to atomically swap both NFTs with ETH top-up distributed via `_distributeFunds` (platform fee + royalty); proposer can cancel to reclaim NFT + ETH; new errors: `SwapNotActive`, `NotCounterparty`, `SwapExpired`; new events: `SwapProposed`, `SwapExecuted`, `SwapCancelled`
- **Custom Errors** - 31 gas-efficient custom errors replacing `require()` strings for cheaper reverts
- **Oracle-Marketplace Integration** - Marketplace reads ETH/USD price from SimpleOracle at purchase time; 2% slippage tolerance protects buyers; excess ETH refunded via pull-payment
- **On-Chain Oracle (SimpleOracle)** - Multi-reporter median-based price feed contract with authorized reporters, round-based aggregation, staleness checks, 50% price deviation protection, force-advance round recovery, on-chain price history (last 10 finalized rounds), emergency price override (`emergencySetPrice`), per-reporter submission tracking, on-chain volatility calculation (`getVolatility`), TWAP (time-weighted average price from circular buffer for manipulation-resistant pricing), and configurable `minRoundInterval` for flash-loan attack prevention (reverts `RoundTooFrequent` if rounds finalize too rapidly)

### Frontend
- **Collection Pages** - Dedicated pages for each NFT collection with banner, stats (items, owners, floor price, volume), and NFT grid
- **Enhanced Profile** - Gradient banner, avatar, ETH balance display, four tabs (Collected, Created, Favorited, Activity), computed volume from on-chain activity
- **Make Offer System** - WETH-based offer modal with amount input and expiration dropdown on NFT detail pages
- **Web3 Transaction States** - 4-stage transaction modal (wallet approval -> blockchain pending -> success / error) with progress bar, mock tx hash, and retry on failure
- **NFT Traits** - Dynamic trait input on the Create page (Type + Value) that appears in the preview card and in the NFT detail attributes section
- **IPFS Storage Notes** - Helper text on the Create page and IPFS metadata link on NFT detail pages
- **Network Indicator** - Pulsing dot badge showing the connected network (Sepolia, Hardhat Local, or Wrong Network) next to the wallet button
- **Custom Wallet Menu** - User dropdown with address display, network switching (Hardhat -> Sepolia), and disconnect button
- **Real Images** - Copyright-free images via picsum.photos with gradient fallbacks on load failure
- **Market Overview** - Real-time market analytics dashboard with Fear & Greed gauge, animated stat cards (market cap, volume, sales, avg floor), collection rankings, top sales carousel, market pulse bars, and key insights - values fluctuate via simulated live data every 4 seconds
- **Decentralized Oracle Demo** - Interactive Oracle Price Feed on the Market page: 7 simulated oracle nodes, 3 aggregation modes (Centralized / Simple Average / ASTREA), click-to-toggle malicious nodes, SVG price consensus chart, stake-weighted median with outlier slashing, bilingual (EN/ZH) educational content explaining the Oracle Problem
- **Oracle Attack Simulator** - Guided 3-step interactive walkthrough on the Market page demonstrating the Oracle Problem: Step 1 shows centralized single-point-of-failure, Step 2 reveals average vulnerability to outliers, Step 3 proves ASTREA resilience — with embedded quick-action buttons, live condition checklists, real-time accuracy meters, animated countdown ring for auto-advance, accuracy snapshots at each stage, and a final 3-column comparison summary with key takeaway
- **Breadcrumb Navigation** - Contextual breadcrumbs on all sub-pages (Explore, Create, NFTDetail, Profile, Activity, Collection, Market)
- **Wallet Integration** - Connect via MetaMask, WalletConnect, and other wallets through RainbowKit
- **Responsive Carousel** - Home page featured NFT carousel adapts to screen size (1 card mobile, 2 tablet, 4 desktop)
- **Accessibility** - ARIA roles/labels on modals and inputs, focus trap in TransactionModal, reduced-motion media query support
- **Global Favorites (Zustand)** - Persistent favorites stored in localStorage via Zustand, synced across NFTDetail and Profile pages
- **Real On-Chain Data** - Explore, NFTDetail, and Profile pages fetch live blockchain data when wallet is connected; graceful mock data fallback when disconnected
- **Real Transaction States** - TransactionModal supports real wagmi transaction lifecycle (wallet approval, blockchain confirmation, success/error) with live tx hash links to Etherscan
- **Modern UI** - Dark-themed, responsive interface with smooth Framer Motion animations and glassmorphism effects
- **Premium Royalty Slider** - Custom-styled range input with gradient track, floating tooltip bubble, tick marks, and glow effects
- **Trending Collections** - Gold/Silver/Bronze rank badges, hover glow effects, animated row entries, and "View All" button
- **Interactive NFT Actions** - Share (copy link), external link (IPFS), and favorite buttons with toast feedback
- **Navbar Search** - Global search bar that navigates to Explore with pre-filled query
- **Skeleton Loading** - Reusable skeleton components (NFTCard, NFTDetail, Profile, Market) for smooth loading states
- **Friendly Error Messages** - Bilingual (EN/ZH) error mapping for all 37+ custom contract errors, wallet rejections, and gas failures
- **Oracle Bridge** - On-chain oracle data preferred when wallet is connected; falls back to client-side simulation when disconnected
- **ESLint Configuration** - Flat config with react-hooks and react-refresh plugins for code quality
- **Crash Prevention** - ErrorBoundary wrapper, 404 page, and null guards for NFT/Collection not-found states
- **Scroll-to-Top** - Automatic scroll reset on route navigation
- **Centralized Mock Data** - 5 collections, 22 NFTs with attributes, offers, activity history, and rich market stats (sparklines, 24h/7d/30d changes, market cap, volume) for realistic demo presentation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.28, OpenZeppelin v5 (ERC-721, ERC-2981, ReentrancyGuard, Pausable) |
| Development & Testing | Hardhat, hardhat-gas-reporter |
| Frontend | React 18, Vite |
| Ethereum Interaction | wagmi v2, viem |
| Wallet UI | RainbowKit |
| Styling | TailwindCSS, Framer Motion |
| State Management | Zustand (persistent favorites) |
| Decentralized Storage | IPFS / Pinata |

---

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [MetaMask](https://metamask.io/) browser extension
- A [Pinata](https://www.pinata.cloud/) account (for IPFS uploads)

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd Project
```

### 2. Install dependencies

```bash
cd contracts && npm install
cd ../frontend && npm install
```

### 3. Start a local Hardhat node

```bash
cd contracts
npx hardhat node
```

This starts a local Ethereum node at `http://127.0.0.1:8545` with pre-funded test accounts.

### 4. Deploy contracts

In a new terminal:

```bash
cd contracts
npx hardhat run scripts/deploy.js --network localhost
```

### 5. Start the frontend

```bash
cd frontend
npm run dev
```

The app will be available at `http://localhost:5173`.

### 6. Connect MetaMask

1. Open MetaMask and add a custom network:
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
2. Import one of the Hardhat test accounts using the private key printed in the terminal from step 3.

---

## Testing

The smart contracts include 158 tests covering minting, USD-denominated listings (with oracle-based ETH conversion, expiration, and price updates), batch listing (up to 20 NFTs per transaction), English auctions (with min bid increment, cancellation, and anti-snipe extension), Dutch auctions (declining-price USD-denominated, escrow, cancellation), on-chain offers (make, accept, cancel), P2P NFT swaps (propose, accept, cancel, expiration, atomic bartering with ETH top-up), royalties, pull-payment withdrawals, pausable operations, custom errors, withdrawal events, oracle integration (stale price, excess refund, slippage tolerance, price view, price changes), and the SimpleOracle contract (including price history, TWAP calculation, flash-loan prevention via minRoundInterval, emergency price override, volatility calculation, reporter submission tracking, edge cases for outlier handling, staleness thresholds, and multi-round finalization).

```bash
cd contracts
npx hardhat test
```

To run with gas reporting:

```bash
REPORT_GAS=true npx hardhat test
```

---

## Deployment (Sepolia)

1. Create a `.env` file in the `contracts/` directory:

   ```env
   SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
   PRIVATE_KEY=your_private_key
   ```

2. Deploy to Sepolia:

   ```bash
   cd contracts
   npx hardhat run scripts/deploy.js --network sepolia
   ```

3. Update the contract addresses in `frontend/src/config/` with the deployed addresses.

---

## Project Structure

```text
|-- contracts/                  # Hardhat project
|   |-- contracts/
|   |   |-- NFTCollection.sol   # ERC-721 token with ERC-2981 royalties
|   |   |-- NFTMarketplace.sol  # Marketplace: listings + auctions + Dutch auctions + offers + P2P swaps + Pausable + custom errors + pull-payment
|   |   `-- SimpleOracle.sol    # On-chain multi-reporter median oracle price feed
|   |-- test/                   # Smart contract tests (158 tests)
|   |-- scripts/
|   |   `-- deploy.js           # Deployment script (deploys all 3 contracts)
|   `-- hardhat.config.js       # Includes hardhat-gas-reporter
|-- frontend/                   # React + Vite application
|   |-- src/
|   |   |-- pages/              # Home, Explore, Create, NFTDetail, Profile, Activity, Collection, Market, NotFound (404)
|   |   |-- components/
|   |   |   |-- layout/         # Navbar (with search + user menu), Footer (multi-column), Layout, ScrollToTop
|   |   |   |-- oracle/         # OracleDashboard, OracleAttackSimulator, OracleEducationPanel
|   |   |   |-- nft/            # NFTCard, NFTGrid, MintForm
|   |   |   |-- marketplace/    # ListingCard, BuyButton, AuctionCard, PlaceBidForm
|   |   |   |-- market/         # FearGreedGauge, StatCard, TopSalesCarousel, CollectionRankings, MarketPulse, KeyInsights
|   |   |   `-- ui/             # Breadcrumb, NetworkBadge, TransactionModal, ErrorBoundary, Skeleton, LoadingSpinner, Modal, Toast
|   |   |-- data/               # Centralized mock data (mockData.js)
|   |   |-- stores/             # Zustand stores (useFavoritesStore.js)
|   |   |-- services/           # Oracle simulation engine (oracleService.js)
|   |   |-- hooks/              # Custom React hooks (useMarketplace, useNFTCollection, useListings, useOracle, useOracleContract, etc.)
|   |   |-- config/             # wagmi config, contract ABIs and addresses
|   |   `-- utils/              # IPFS helpers, formatting utilities, shared animation variants, error messages
|   `-- package.json
|-- architecture.md             # Architecture and design documentation
`-- business-logic.md           # Business logic and implementation notes
```

---

## Architecture

The system is composed of two smart contracts and a React frontend:

- **NFTCollection** - An ERC-721 contract extended with ERC-2981 royalty information. Handles minting and stores a creator-defined royalty percentage that is enforced on all secondary sales.
- **NFTMarketplace** - Manages fixed-price listings (with optional expiration), English auctions (with 5% minimum bid increment and anti-snipe extension), Dutch auctions (declining USD price via oracle), on-chain offers (ETH escrowed), and P2P NFT swaps (atomic bartering with optional ETH top-up). Uses Pausable for emergency stops, 31 custom errors for gas savings, pull-payment for all fund distribution, and ReentrancyGuard for security. Supports 6 sale mechanisms vs OpenSea's 2.
- **SimpleOracle** - On-chain price feed with authorized reporters, round-based median aggregation, and staleness checks.
- **Frontend** - A single-page React application that communicates with the contracts via wagmi and viem. Wallet connectivity is provided by RainbowKit, global state by Zustand, and NFT metadata/images are stored on IPFS through Pinata. Pages show real on-chain data when wallet is connected.

For detailed architecture diagrams and business logic documentation, see [architecture.md](architecture.md) and [business-logic.md](business-logic.md).

---

## Team

| Name | Role |
|---|---|
| Member 1 | TBD |
| Member 2 | TBD |
| Member 3 | TBD |
| Member 4 | TBD |

---

## License

This project is licensed under the [MIT License](LICENSE).
