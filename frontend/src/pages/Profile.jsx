import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import {
  FiCopy,
  FiExternalLink,
  FiGrid,
  FiTag,
  FiActivity,
  FiArrowRight,
  FiCheckCircle,
  FiHeart,
  FiX,
} from "react-icons/fi";
import { HiOutlineUser, HiOutlinePaintBrush } from "react-icons/hi2";
import toast from "react-hot-toast";
import { MOCK_USER_PROFILE, getNFTById } from "@/data/mockData";
import Breadcrumb from "@/components/ui/Breadcrumb";
import TransactionModal from "@/components/ui/TransactionModal";

const TABS = [
  { key: "collected", label: "Collected", icon: FiGrid },
  { key: "created", label: "Created", icon: HiOutlinePaintBrush },
  { key: "favorited", label: "Favorited", icon: FiHeart },
  { key: "activity", label: "Activity", icon: FiActivity },
];

const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4 } },
};

export default function Profile() {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState("collected");
  const [copied, setCopied] = useState(false);

  const [imgErrors, setImgErrors] = useState({});

  // List for sale modal state
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listNFT, setListNFT] = useState(null);
  const [listPrice, setListPrice] = useState("");
  const [listType, setListType] = useState("fixed");

  // Transaction modal state
  const [txModalOpen, setTxModalOpen] = useState(false);

  const displayAddress = isConnected
    ? address
    : MOCK_USER_PROFILE.address;
  const truncated = `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`;

  const copyAddress = () => {
    navigator.clipboard.writeText(displayAddress);
    setCopied(true);
    toast.success("Address copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const ownedNFTs = MOCK_USER_PROFILE.owned.map((id) => getNFTById(id)).filter(Boolean);
  const createdNFTs = MOCK_USER_PROFILE.created.map((id) => getNFTById(id)).filter(Boolean);
  const favoritedNFTs = MOCK_USER_PROFILE.favorited.map((id) => getNFTById(id)).filter(Boolean);

  const handleListForSale = (nft) => {
    setListNFT(nft);
    setListPrice("");
    setListType("fixed");
    setListModalOpen(true);
  };

  const handleConfirmListing = () => {
    setListModalOpen(false);
    setTxModalOpen(true);
  };

  const handleTxComplete = () => {
    toast.success(`${listNFT?.name} listed for ${listPrice} ETH!`);
    setListNFT(null);
    setListPrice("");
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-dark-950 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Profile" },
        ]}
      />

      {/* ====== Profile Header ====== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden mb-10"
      >
        {/* Gradient Banner */}
        <div className="h-36 sm:h-44 rounded-2xl bg-gradient-to-r from-primary-600 via-purple-600 to-pink-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iYSIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVHJhbnNmb3JtPSJyb3RhdGUoNDUpIj48cGF0aCBkPSJNLTEwIDMwaDYwIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-50" />

          {/* Avatar overlapping bottom of banner */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-400 to-purple-600 flex items-center justify-center ring-4 ring-dark-950">
              <HiOutlineUser className="text-4xl text-white" />
            </div>
          </div>
        </div>

        {/* Below banner content */}
        <div className="pt-16 pb-6 px-6">
          {/* Address + actions */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="font-mono text-dark-300 text-sm">{truncated}</span>
            <button
              onClick={copyAddress}
              className="text-dark-400 hover:text-primary-400 transition-colors"
            >
              {copied ? <FiCheckCircle size={16} /> : <FiCopy size={16} />}
            </button>
            <a
              href={`https://etherscan.io/address/${displayAddress}`}
              target="_blank"
              rel="noreferrer"
              className="text-dark-400 hover:text-primary-400 transition-colors"
            >
              <FiExternalLink size={16} />
            </a>
          </div>

          {!isConnected && (
            <p className="text-yellow-400/80 text-xs text-center mb-4">
              Wallet not connected -- showing mock data
            </p>
          )}

          {/* Stats row */}
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">
                {MOCK_USER_PROFILE.owned.length}
              </p>
              <p className="text-dark-400 text-sm">Owned</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">
                {MOCK_USER_PROFILE.created.length}
              </p>
              <p className="text-dark-400 text-sm">Created</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold gradient-text">
                {MOCK_USER_PROFILE.ethBalance} ETH
              </p>
              <p className="text-dark-400 text-sm">Balance</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold gradient-text">
                {MOCK_USER_PROFILE.activity
                  .filter((a) => a.price && a.price !== "--")
                  .reduce((sum, a) => {
                    const val = parseFloat(a.price.replace(/[^\d.]/g, ""));
                    return sum + (isNaN(val) ? 0 : val);
                  }, 0)
                  .toFixed(2)}{" "}
                ETH
              </p>
              <p className="text-dark-400 text-sm">Volume</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ====== Tabs ====== */}
      <div className="flex border-b border-dark-800 mb-8">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === tab.key
                ? "text-primary-400"
                : "text-dark-400 hover:text-white"
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {activeTab === tab.key && (
              <motion.div
                layoutId="profile-tab-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5 gradient-bg rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      {/* ====== Tab Content ====== */}
      <AnimatePresence mode="wait">
        {/* COLLECTED */}
        {activeTab === "collected" && (
          <motion.div
            key="collected"
            variants={stagger}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {ownedNFTs.map((nft) => (
              <motion.div
                key={nft.id}
                variants={cardVariant}
                whileHover={{ y: -6, scale: 1.02 }}
                className="glass-card overflow-hidden group cursor-pointer"
              >
                <Link to={`/nft/${nft.id}`}>
                  <div className="relative h-48 overflow-hidden">
                    {imgErrors[nft.id] ? (
                      <div className={`w-full h-full bg-gradient-to-br ${nft.gradient} flex items-center justify-center`}>
                        <span className="text-white/30 text-5xl font-bold">{nft.name.charAt(0)}</span>
                      </div>
                    ) : (
                      <img
                        src={nft.image}
                        alt={nft.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={() => setImgErrors((prev) => ({ ...prev, [nft.id]: true }))}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                  </div>
                </Link>
                <div className="p-4">
                  <Link to={`/nft/${nft.id}`}>
                    <h3 className="text-white font-semibold truncate hover:text-primary-400 transition-colors">
                      {nft.name}
                    </h3>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleListForSale(nft);
                    }}
                    className="btn-secondary text-xs w-full mt-3 flex items-center justify-center gap-1.5"
                  >
                    <FiTag size={12} />
                    List for Sale
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* CREATED */}
        {activeTab === "created" && (
          <motion.div
            key="created"
            variants={stagger}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {createdNFTs.map((nft) => (
              <motion.div
                key={nft.id}
                variants={cardVariant}
                whileHover={{ y: -6, scale: 1.02 }}
                className="glass-card overflow-hidden group cursor-pointer"
              >
                <Link to={`/nft/${nft.id}`}>
                  <div className="relative h-48 overflow-hidden">
                    {imgErrors[nft.id] ? (
                      <div className={`w-full h-full bg-gradient-to-br ${nft.gradient} flex items-center justify-center`}>
                        <span className="text-white/30 text-5xl font-bold">{nft.name.charAt(0)}</span>
                      </div>
                    ) : (
                      <img
                        src={nft.image}
                        alt={nft.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={() => setImgErrors((prev) => ({ ...prev, [nft.id]: true }))}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                  </div>
                </Link>
                <div className="p-4">
                  <Link to={`/nft/${nft.id}`}>
                    <h3 className="text-white font-semibold truncate hover:text-primary-400 transition-colors">
                      {nft.name}
                    </h3>
                  </Link>
                  <Link
                    to={`/nft/${nft.id}`}
                    className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1 mt-2 transition-colors"
                  >
                    View <FiArrowRight size={14} />
                  </Link>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* FAVORITED */}
        {activeTab === "favorited" && (
          <motion.div
            key="favorited"
            variants={stagger}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {favoritedNFTs.map((nft) => (
              <motion.div
                key={nft.id}
                variants={cardVariant}
                whileHover={{ y: -6, scale: 1.02 }}
                className="glass-card overflow-hidden group cursor-pointer"
              >
                <Link to={`/nft/${nft.id}`}>
                  <div className="relative h-48 overflow-hidden">
                    {imgErrors[nft.id] ? (
                      <div className={`w-full h-full bg-gradient-to-br ${nft.gradient} flex items-center justify-center`}>
                        <span className="text-white/30 text-5xl font-bold">{nft.name.charAt(0)}</span>
                      </div>
                    ) : (
                      <img
                        src={nft.image}
                        alt={nft.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={() => setImgErrors((prev) => ({ ...prev, [nft.id]: true }))}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                  </div>
                </Link>
                <div className="p-4">
                  <Link to={`/nft/${nft.id}`}>
                    <h3 className="text-white font-semibold truncate hover:text-primary-400 transition-colors">
                      {nft.name}
                    </h3>
                  </Link>
                  <Link
                    to={`/nft/${nft.id}`}
                    className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1 mt-2 transition-colors"
                  >
                    View <FiArrowRight size={14} />
                  </Link>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* ACTIVITY */}
        {activeTab === "activity" && (
          <motion.div
            key="activity"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card overflow-hidden"
          >
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 text-dark-400 text-xs uppercase tracking-wider border-b border-dark-800">
              <span className="col-span-3">Event</span>
              <span className="col-span-4">NFT</span>
              <span className="col-span-3 text-right">Price</span>
              <span className="col-span-2 text-right">Time</span>
            </div>

            {MOCK_USER_PROFILE.activity.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`grid grid-cols-12 gap-4 items-center px-6 py-4 text-sm border-b border-dark-800/50 last:border-b-0 ${
                  i % 2 === 0 ? "bg-dark-900/30" : ""
                }`}
              >
                <span className="col-span-3 text-primary-400 font-medium">
                  {a.event}
                </span>
                <span className="col-span-4 text-white truncate">
                  <Link
                    to={`/nft/${a.nftId}`}
                    className="hover:text-primary-400 transition-colors"
                  >
                    {a.nft}
                  </Link>
                </span>
                <span className="col-span-3 text-right text-white">
                  {a.price}
                </span>
                <span className="col-span-2 text-right text-dark-400">
                  {a.time}
                </span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== List for Sale Modal ====== */}
      <AnimatePresence>
        {listModalOpen && listNFT && (
          <motion.div
            key="list-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{
              backgroundColor: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => setListModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-6 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setListModalOpen(false)}
                className="absolute top-4 right-4 text-dark-400 hover:text-white transition-colors"
              >
                <FiX size={20} />
              </button>

              {/* NFT name */}
              <h3 className="text-xl font-bold text-white mb-6">
                List {listNFT.name}
              </h3>

              {/* Price input */}
              <label className="block text-sm text-dark-300 mb-2">Price</label>
              <div className="relative mb-6">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={listPrice}
                  onChange={(e) => setListPrice(e.target.value)}
                  placeholder="0.00"
                  className="input-field w-full pr-14"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400 text-sm font-medium">
                  ETH
                </span>
              </div>

              {/* Listing type */}
              <label className="block text-sm text-dark-300 mb-2">
                Listing Type
              </label>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={() => setListType("fixed")}
                  className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                    listType === "fixed"
                      ? "border-primary-500 bg-primary-500/10 text-primary-400"
                      : "border-dark-700 bg-dark-800 text-dark-300 hover:border-dark-600"
                  }`}
                >
                  Fixed Price
                </button>
                <button
                  onClick={() => setListType("auction")}
                  className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                    listType === "auction"
                      ? "border-primary-500 bg-primary-500/10 text-primary-400"
                      : "border-dark-700 bg-dark-800 text-dark-300 hover:border-dark-600"
                  }`}
                >
                  Auction
                </button>
              </div>

              {/* Confirm button */}
              <button
                onClick={handleConfirmListing}
                disabled={!listPrice || parseFloat(listPrice) <= 0}
                className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm Listing
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== Transaction Modal ====== */}
      <TransactionModal
        isOpen={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        onComplete={handleTxComplete}
        title="Listing NFT"
      />
    </motion.div>
  );
}
