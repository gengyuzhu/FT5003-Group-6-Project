# NFT Marketplace

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636?logo=solidity)](https://soliditylang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![Hardhat](https://img.shields.io/badge/Hardhat-fff200?logo=hardhat)](https://hardhat.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A full-stack decentralized NFT marketplace built on Ethereum, supporting minting, fixed-price listings, English auctions, and on-chain royalty enforcement. Developed as a group project for **FT5003 Blockchain Innovations** at the National University of Singapore (NUS).

---

## Features

### Smart Contract
- **Mint NFTs** 鈥?Create ERC-721 tokens with metadata stored on IPFS via Pinata
- **Fixed-Price Listings** 鈥?List NFTs at a set price and allow instant purchases
- **English Auctions** 鈥?Time-bound auctions with real-time countdown timers and competitive bidding
- **Royalty Enforcement** 鈥?ERC-2981 royalties applied automatically on every secondary sale
- **Platform Fee** 鈥?Configurable marketplace fee (default 2.5%) collected on each transaction
- **Secure Payments** 鈥?Pull-over-push pattern for auction refunds, guarded by ReentrancyGuard

### Frontend
- **Collection Pages** 鈥?Dedicated pages for each NFT collection with banner, stats (items, owners, floor price, volume), and NFT grid
- **Enhanced Profile** 鈥?Gradient banner, avatar, ETH balance display, four tabs (Collected, Created, Favorited, Activity), computed volume from on-chain activity
- **Make Offer System** 鈥?WETH-based offer modal with amount input and expiration dropdown on NFT detail pages
- **Web3 Transaction States** 鈥?4-stage transaction modal (wallet approval 鈫?blockchain pending 鈫?success / error) with progress bar, mock tx hash, and retry on failure
- **NFT Traits** 鈥?Dynamic trait input on the Create page (Type + Value) that appears in the preview card and in the NFT detail attributes section
- **IPFS Storage Notes** 鈥?Helper text on the Create page and IPFS metadata link on NFT detail pages
- **Network Indicator** 鈥?Pulsing dot badge showing the connected network (Sepolia, Hardhat Local, or Wrong Network) next to the wallet button
- **Custom Wallet Menu** 鈥?User dropdown with address display, network switching (Hardhat 鈫?Sepolia), and disconnect button
- **Real Images** 鈥?Copyright-free images via picsum.photos with gradient fallbacks on load failure
- **Market Overview** 鈥?Real-time market analytics dashboard with Fear & Greed gauge, animated stat cards (market cap, volume, sales, avg floor), collection rankings, top sales carousel, market pulse bars, and key insights 鈥?values fluctuate via simulated live data every 4 seconds
- **Breadcrumb Navigation** 鈥?Contextual breadcrumbs on all sub-pages (Explore, Create, NFTDetail, Profile, Activity, Collection, Market)
- **Wallet Integration** 鈥?Connect via MetaMask, WalletConnect, and other wallets through RainbowKit
- **Modern UI** 鈥?Dark-themed, responsive interface with smooth Framer Motion animations and glassmorphism effects
- **Premium Royalty Slider** 鈥?Custom-styled range input with gradient track, floating tooltip bubble, tick marks, and glow effects
- **Trending Collections** 鈥?Gold/Silver/Bronze rank badges, hover glow effects, animated row entries, and "View All" button
- **Interactive NFT Actions** 鈥?Share (copy link), external link (IPFS), and favorite buttons with toast feedback
- **Navbar Search** 鈥?Global search bar that navigates to Explore with pre-filled query
- **Crash Prevention** 鈥?ErrorBoundary wrapper, 404 page, and null guards for NFT/Collection not-found states
- **Scroll-to-Top** 鈥?Automatic scroll reset on route navigation
- **Centralized Mock Data** 鈥?5 collections, 22 NFTs with attributes, offers, activity history, and rich market stats (sparklines, 24h/7d/30d changes, market cap, volume) for realistic demo presentation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.28, OpenZeppelin v5 (ERC-721, ERC-2981, ReentrancyGuard) |
| Development & Testing | Hardhat |
| Frontend | React 18, Vite |
| Ethereum Interaction | wagmi v2, viem |
| Wallet UI | RainbowKit |
| Styling | TailwindCSS, Framer Motion |
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

The smart contracts include 28 tests covering minting, listings, auctions, royalties, and edge cases.

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
    DEPLOYER_PRIVATE_KEY=your_private_key
    ```

2. Deploy to Sepolia:

    ```bash
    cd contracts
    npx hardhat run scripts/deploy.js --network sepolia
    ```

3. Update the contract addresses in `frontend/src/config/` with the deployed addresses.

---

## Project Structure

```
鈹溾攢鈹€ contracts/                  # Hardhat project
鈹?  鈹溾攢鈹€ contracts/
鈹?  鈹?  鈹溾攢鈹€ NFTCollection.sol   # ERC-721 token with ERC-2981 royalties
鈹?  鈹?  鈹斺攢鈹€ NFTMarketplace.sol  # Marketplace: listings + auctions
鈹?  鈹溾攢鈹€ test/                   # Smart contract tests (28 tests)
鈹?  鈹溾攢鈹€ scripts/
鈹?  鈹?  鈹斺攢鈹€ deploy.js           # Deployment script
鈹?  鈹斺攢鈹€ hardhat.config.js
鈹溾攢鈹€ frontend/                   # React + Vite application
鈹?  鈹溾攢鈹€ src/
鈹?  鈹?  鈹溾攢鈹€ pages/              # Home, Explore, Create, NFTDetail, Profile, Activity, Collection, Market, NotFound (404)
鈹?  鈹?  鈹溾攢鈹€ components/
鈹?  鈹?  鈹?  鈹溾攢鈹€ layout/         # Navbar (with search + user menu), Footer (multi-column), Layout, ScrollToTop
鈹?  鈹?  鈹?  鈹斺攢鈹€ ui/             # Breadcrumb, NetworkBadge, TransactionModal, ErrorBoundary, LoadingSpinner, Toast
鈹?  鈹?  鈹溾攢鈹€ data/               # Centralized mock data (mockData.js)
鈹?  鈹?  鈹溾攢鈹€ hooks/              # Custom React hooks for contract interactions
鈹?  鈹?  鈹溾攢鈹€ config/             # wagmi config, contract ABIs and addresses
鈹?  鈹?  鈹斺攢鈹€ utils/              # IPFS helpers, formatting utilities
鈹?  鈹斺攢鈹€ package.json
|- architecture.md             # Architecture and design documentation
\- business-logic.md           # Business logic and implementation notes
```

---

## Architecture

The system is composed of two smart contracts and a React frontend:

- **NFTCollection** 鈥?An ERC-721 contract extended with ERC-2981 royalty information. Handles minting and stores a creator-defined royalty percentage that is enforced on all secondary sales.
- **NFTMarketplace** 鈥?Manages fixed-price listings and English auctions. Collects a configurable platform fee, distributes royalties to creators, and uses a pull-over-push withdrawal pattern to securely handle auction refunds.
- **Frontend** 鈥?A single-page React application that communicates with the contracts via wagmi and viem. Wallet connectivity is provided by RainbowKit, and NFT metadata and images are stored on IPFS through Pinata.

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
