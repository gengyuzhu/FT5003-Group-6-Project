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
- **Mint NFTs** — Create ERC-721 tokens with metadata stored on IPFS via Pinata
- **Fixed-Price Listings** — List NFTs at a set price and allow instant purchases
- **English Auctions** — Time-bound auctions with real-time countdown timers and competitive bidding
- **Royalty Enforcement** — ERC-2981 royalties applied automatically on every secondary sale
- **Platform Fee** — Configurable marketplace fee (default 2.5%) collected on each transaction
- **Secure Payments** — Pull-over-push pattern for auction refunds, guarded by ReentrancyGuard

### Frontend
- **Collection Pages** — Dedicated pages for each NFT collection with banner, stats (items, owners, floor price, volume), and NFT grid
- **Enhanced Profile** — Gradient banner, avatar, ETH balance display, four tabs (Collected, Created, Favorited, Activity), computed volume from on-chain activity
- **Make Offer System** — WETH-based offer modal with amount input and expiration dropdown on NFT detail pages
- **Web3 Transaction States** — 4-stage transaction modal (wallet approval → blockchain pending → success / error) with progress bar, mock tx hash, and retry on failure
- **NFT Traits** — Dynamic trait input on the Create page (Type + Value) that appears in the preview card and in the NFT detail attributes section
- **IPFS Storage Notes** — Helper text on the Create page and IPFS metadata link on NFT detail pages
- **Network Indicator** — Pulsing dot badge showing the connected network (Sepolia, Hardhat Local, or Wrong Network) next to the wallet button
- **Custom Wallet Menu** — User dropdown with address display, network switching (Hardhat ↔ Sepolia), and disconnect button
- **Real Images** — Copyright-free images via picsum.photos with gradient fallbacks on load failure
- **Breadcrumb Navigation** — Contextual breadcrumbs on all sub-pages (Explore, Create, NFTDetail, Profile, Activity, Collection)
- **Wallet Integration** — Connect via MetaMask, WalletConnect, and other wallets through RainbowKit
- **Modern UI** — Dark-themed, responsive interface with smooth Framer Motion animations and glassmorphism effects
- **Premium Royalty Slider** — Custom-styled range input with gradient track, floating tooltip bubble, tick marks, and glow effects
- **Trending Collections** — Gold/Silver/Bronze rank badges, hover glow effects, animated row entries, and "View All" button
- **Interactive NFT Actions** — Share (copy link), external link (IPFS), and favorite buttons with toast feedback
- **Navbar Search** — Global search bar that navigates to Explore with pre-filled query
- **Crash Prevention** — ErrorBoundary wrapper, 404 page, and null guards for NFT/Collection not-found states
- **Scroll-to-Top** — Automatic scroll reset on route navigation
- **Centralized Mock Data** — 5 collections, 22 NFTs with attributes, offers, and activity history for realistic demo presentation

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
├── contracts/                  # Hardhat project
│   ├── contracts/
│   │   ├── NFTCollection.sol   # ERC-721 token with ERC-2981 royalties
│   │   └── NFTMarketplace.sol  # Marketplace: listings + auctions
│   ├── test/                   # Smart contract tests (28 tests)
│   ├── scripts/
│   │   └── deploy.js           # Deployment script
│   └── hardhat.config.js
├── frontend/                   # React + Vite application
│   ├── src/
│   │   ├── pages/              # Home, Explore, Create, NFTDetail, Profile, Activity, Collection, NotFound (404)
│   │   ├── components/
│   │   │   ├── layout/         # Navbar (with search + user menu), Footer (multi-column), Layout, ScrollToTop
│   │   │   └── ui/             # Breadcrumb, NetworkBadge, TransactionModal, ErrorBoundary, LoadingSpinner, Toast
│   │   ├── data/               # Centralized mock data (mockData.js)
│   │   ├── hooks/              # Custom React hooks for contract interactions
│   │   ├── config/             # wagmi config, contract ABIs and addresses
│   │   └── utils/              # IPFS helpers, formatting utilities
│   └── package.json
└── docs/                       # Architecture and business logic documentation
```

---

## Architecture

The system is composed of two smart contracts and a React frontend:

- **NFTCollection** — An ERC-721 contract extended with ERC-2981 royalty information. Handles minting and stores a creator-defined royalty percentage that is enforced on all secondary sales.
- **NFTMarketplace** — Manages fixed-price listings and English auctions. Collects a configurable platform fee, distributes royalties to creators, and uses a pull-over-push withdrawal pattern to securely handle auction refunds.
- **Frontend** — A single-page React application that communicates with the contracts via wagmi and viem. Wallet connectivity is provided by RainbowKit, and NFT metadata and images are stored on IPFS through Pinata.

For detailed architecture diagrams and business logic documentation, see the [`docs/`](docs/) directory.

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
