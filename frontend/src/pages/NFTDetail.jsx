import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import toast from "react-hot-toast";
import {
  FiExternalLink,
  FiHeart,
  FiShare2,
  FiClock,
  FiTag,
  FiShoppingCart,
  FiX,
  FiCopy,
  FiCheckCircle,
} from "react-icons/fi";
import { HiOutlineBolt } from "react-icons/hi2";
import { getNFTById, getCollectionById } from "@/data/mockData";
import { useBuyNFT, usePlaceBid } from "@/hooks/useMarketplace";
import useFavoritesStore from "@/stores/useFavoritesStore";
import Breadcrumb from "@/components/ui/Breadcrumb";
import TransactionModal from "@/components/ui/TransactionModal";

const truncate = (addr) =>
  addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

const TABS = ["Details", "Activity", "Offers"];

const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.3 } },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.85, y: 30 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 25 },
  },
  exit: { opacity: 0, scale: 0.9, y: 20, transition: { duration: 0.25 } },
};

export default function NFTDetail() {
  const { id } = useParams();
  const nft = getNFTById(id);
  const collection = nft ? getCollectionById(nft.collectionId) : null;

  const { isConnected } = useAccount();
  const { buy, hash: buyHash, isPending: buyPending, isConfirming: buyConfirming, isSuccess: buySuccess, error: buyError } = useBuyNFT();
  const { bid: placeBid, hash: bidHash, isPending: bidPending, isConfirming: bidConfirming, isSuccess: bidSuccess, error: bidError } = usePlaceBid();
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const nftId = nft ? nft.id : null;
  const liked = useFavoritesStore((s) => nftId !== null && s.favorites.includes(nftId));

  // All hooks must be called before any early return (Rules of Hooks)
  const [activeTab, setActiveTab] = useState("Details");
  const [bidAmount, setBidAmount] = useState("");
  const [imgError, setImgError] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const copyTimerRef = useRef(null);
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txModalTitle, setTxModalTitle] = useState("Processing Transaction");
  const [txAction, setTxAction] = useState(null); // "buy" | "bid" | null
  const [offerModal, setOfferModal] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerExpiration, setOfferExpiration] = useState("7 Days");

  if (!nft) {
    return (
      <motion.div variants={pageVariants} initial="hidden" animate="visible" className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="glass-card max-w-md w-full p-8 text-center space-y-4">
          <div className="text-5xl mb-2">🔍</div>
          <h2 className="text-2xl font-bold gradient-text">NFT Not Found</h2>
          <p className="text-dark-300">The NFT you&#39;re looking for doesn&#39;t exist or has been removed.</p>
          <Link to="/explore" className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 mt-2">Explore NFTs</Link>
        </div>
      </motion.div>
    );
  }

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      toast.success("Copied to clipboard!");
      const t = setTimeout(() => setCopiedField(null), 2000);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = t;
    }).catch(() => {
      toast.error("Failed to copy to clipboard");
    });
  };

  const handleBuy = () => {
    setTxModalTitle("Processing Purchase");
    setTxAction("buy");
    if (isConnected && nft.listingId != null) {
      buy(nft.listingId, nft.priceWei || 0n);
    }
    setTxModalOpen(true);
  };

  const handleBid = () => {
    if (!bidAmount || parseFloat(bidAmount) <= 0) {
      toast.error("Enter a valid bid amount");
      return;
    }
    if (nft.currentBid && parseFloat(bidAmount) <= parseFloat(nft.currentBid)) {
      toast.error(`Bid must exceed current bid of ${nft.currentBid} ETH`);
      return;
    }
    setTxModalTitle("Placing Bid");
    setTxAction("bid");
    if (isConnected && nft.auctionId != null) {
      placeBid(nft.auctionId, bidAmount);
    }
    setTxModalOpen(true);
  };

  const handleTxComplete = () => {
    toast.success("Transaction completed successfully!");
    setBidAmount("");
    setTxAction(null);
  };

  // Derive real tx state based on action
  const txHash = txAction === "buy" ? buyHash : txAction === "bid" ? bidHash : undefined;
  const txIsPending = txAction === "buy" ? buyPending : txAction === "bid" ? bidPending : undefined;
  const txIsConfirming = txAction === "buy" ? buyConfirming : txAction === "bid" ? bidConfirming : undefined;
  const txIsSuccess = txAction === "buy" ? buySuccess : txAction === "bid" ? bidSuccess : undefined;
  const txError = txAction === "buy" ? buyError : txAction === "bid" ? bidError : undefined;

  const handleOfferSubmit = () => {
    if (!offerAmount || parseFloat(offerAmount) <= 0) {
      toast.error("Enter a valid offer amount");
      return;
    }
    setOfferModal(false);
    setTxModalTitle("Submitting Offer");
    setTxModalOpen(true);
    setOfferAmount("");
    setOfferExpiration("7 Days");
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-dark-950 py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Explore", to: "/explore" },
          { label: nft.name },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* ====== LEFT: image ====== */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div
            className={`rounded-2xl overflow-hidden aspect-square shadow-2xl shadow-primary-500/10 ${
              imgError ? `bg-gradient-to-br ${nft.gradient} flex items-center justify-center` : ""
            }`}
          >
            {imgError ? (
              <span className="text-white/30 text-[10rem] font-extrabold select-none leading-none">
                {nft.name.charAt(0)}
              </span>
            ) : (
              <img
                src={nft.image}
                alt={nft.name}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            )}
          </div>

          {/* action row */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => toggleFavorite(nft.id)}
              className={`glass-card p-3 rounded-xl transition-colors ${
                liked ? "text-red-400" : "text-dark-400 hover:text-red-400"
              }`}
            >
              <FiHeart style={liked ? { fill: 'currentColor', strokeWidth: 0 } : {}} />
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                  toast.success("Link copied to clipboard!");
                }).catch(() => {
                  toast.error("Failed to copy link");
                });
              }}
              className="glass-card p-3 rounded-xl text-dark-400 hover:text-primary-400 transition-colors"
            >
              <FiShare2 />
            </button>
            <button
              onClick={() => {
                if (nft.ipfsHash) {
                  window.open(`https://ipfs.io/ipfs/${nft.ipfsHash}`, "_blank");
                } else {
                  toast("View on blockchain explorer", { icon: "🔗" });
                }
              }}
              className="glass-card p-3 rounded-xl text-dark-400 hover:text-primary-400 transition-colors"
            >
              <FiExternalLink />
            </button>
          </div>
        </motion.div>

        {/* ====== RIGHT: info ====== */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="space-y-6"
        >
          <div>
            <span className="text-primary-400 text-sm font-semibold uppercase tracking-wider">
              {nft.category}
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
              {nft.name}
            </h1>
          </div>

          <p className="text-dark-300 leading-relaxed">{nft.description}</p>

          {/* creator / owner */}
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-dark-500 text-xs uppercase tracking-wider mb-1">Creator</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500" />
                <span className="text-white text-sm font-mono">
                  {truncate(nft.creator)}
                </span>
              </div>
            </div>
            <div>
              <p className="text-dark-500 text-xs uppercase tracking-wider mb-1">Owner</p>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500" />
                <span className="text-white text-sm font-mono">
                  {truncate(nft.owner)}
                </span>
              </div>
            </div>
          </div>

          {/* Collection link */}
          {collection && (
            <div>
              <p className="text-dark-500 text-xs uppercase tracking-wider mb-1">Collection</p>
              <Link
                to={`/collection/${nft.collectionSlug}`}
                className="text-primary-400 hover:text-primary-300 transition-colors font-medium"
              >
                {collection.name}
              </Link>
            </div>
          )}

          {/* price / auction box */}
          <div className="glass-card p-6 space-y-4">
            {nft.type === "auction" ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-dark-400 text-sm flex items-center gap-1">
                      <FiClock /> Auction ends
                    </p>
                    <p className="text-white font-semibold">
                      {new Date(nft.endTime).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-dark-400 text-sm">Current Bid</p>
                    <p className="gradient-text text-2xl font-bold">
                      {nft.currentBid} ETH
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Enter bid (ETH)"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="input-field flex-1"
                  />
                  <button onClick={handleBid} className="btn-primary px-6 py-2">
                    Place Bid
                  </button>
                </div>

                <button
                  onClick={() => setOfferModal(true)}
                  className="btn-secondary w-full py-3 text-sm font-semibold"
                >
                  Make Offer
                </button>
              </>
            ) : (
              <>
                <div>
                  <p className="text-dark-400 text-sm flex items-center gap-1">
                    <FiTag /> Price
                  </p>
                  <p className="gradient-text text-3xl font-bold">
                    {nft.price} ETH
                  </p>
                </div>
                <button
                  onClick={handleBuy}
                  className="btn-primary w-full py-3 text-lg font-semibold flex items-center justify-center gap-2"
                >
                  <FiShoppingCart /> Buy Now
                </button>
                <button
                  onClick={() => setOfferModal(true)}
                  className="btn-secondary w-full py-3 text-sm font-semibold"
                >
                  Make Offer
                </button>
              </>
            )}
          </div>

          {/* ====== TABS ====== */}
          <div>
            <div className="flex border-b border-dark-800 mb-4">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 text-sm font-medium transition-colors relative ${
                    activeTab === tab
                      ? "text-primary-400"
                      : "text-dark-400 hover:text-white"
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 gradient-bg rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                {/* Details tab */}
                {activeTab === "Details" && (
                  <div className="space-y-4">
                    {/* Attributes grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {nft.attributes.map((attr) => (
                        <div
                          key={attr.trait_type}
                          className="glass-card p-3 text-center"
                        >
                          <p className="text-primary-400 text-xs uppercase tracking-wider">
                            {attr.trait_type}
                          </p>
                          <p className="text-white font-semibold text-sm mt-1">
                            {attr.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Contract info */}
                    <div className="glass-card p-4 space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-dark-400">Contract</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-white font-mono">{nft.contractAddress}</span>
                          <button onClick={() => copyToClipboard(nft.contractAddress, "contract")} className="text-dark-400 hover:text-primary-400 transition-colors">
                            {copiedField === "contract" ? <FiCheckCircle size={13} className="text-green-400" /> : <FiCopy size={13} />}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-dark-400">Token ID</span>
                        <span className="text-white">{nft.tokenId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-dark-400">Blockchain</span>
                        <span className="text-white">{nft.blockchain}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-dark-400">Royalty</span>
                        <span className="text-white">{nft.royalty}</span>
                      </div>
                      {nft.ipfsHash && (
                        <div className="flex justify-between items-center">
                          <span className="text-dark-400">IPFS</span>
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`https://ipfs.io/ipfs/${nft.ipfsHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary-400 hover:text-primary-300 transition-colors font-mono text-xs flex items-center gap-1"
                            >
                              {nft.ipfsHash.slice(0, 8)}...{nft.ipfsHash.slice(-6)}
                              <FiExternalLink size={12} />
                            </a>
                            <button onClick={() => copyToClipboard(nft.ipfsHash, "ipfs")} className="text-dark-400 hover:text-primary-400 transition-colors">
                              {copiedField === "ipfs" ? <FiCheckCircle size={13} className="text-green-400" /> : <FiCopy size={13} />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Activity tab */}
                {activeTab === "Activity" && (
                  <div className="space-y-2">
                    {nft.activity.map((a, i) => (
                      <div
                        key={i}
                        className={`glass-card p-3 flex items-center justify-between text-sm ${
                          i % 2 === 0 ? "bg-dark-900/60" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <HiOutlineBolt className="text-primary-400" />
                          <div>
                            <p className="text-white font-medium">{a.event}</p>
                            <p className="text-dark-500 text-xs">
                              {a.from} &rarr; {a.to}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white">{a.price}</p>
                          <p className="text-dark-500 text-xs">{a.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Offers tab */}
                {activeTab === "Offers" && (
                  <div className="space-y-2">
                    {nft.offers.length === 0 ? (
                      <p className="text-dark-500 text-center py-8">
                        No offers yet
                      </p>
                    ) : (
                      nft.offers.map((b, i) => (
                        <div
                          key={i}
                          className="glass-card p-3 flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                              {i + 1}
                            </div>
                            <span className="text-white font-mono">
                              {b.bidder}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="gradient-text font-bold flex items-center justify-end gap-1.5">
                              {b.amount}
                              <span className="text-pink-400 text-xs font-semibold">
                                WETH
                              </span>
                            </p>
                            <p className="text-dark-500 text-xs">
                              {b.expiration && (
                                <span className="mr-2">Expires: {b.expiration}</span>
                              )}
                              {b.time}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* ====== Transaction Modal ====== */}
      <TransactionModal
        isOpen={txModalOpen}
        onClose={() => { setTxModalOpen(false); setTxAction(null); }}
        onComplete={handleTxComplete}
        title={txModalTitle}
        isPending={isConnected ? txIsPending : undefined}
        isConfirming={isConnected ? txIsConfirming : undefined}
        isSuccess={isConnected ? txIsSuccess : undefined}
        error={isConnected ? txError : undefined}
        txHash={isConnected ? txHash : undefined}
      />

      {/* ====== Make Offer Modal ====== */}
      <AnimatePresence>
        {offerModal && (
          <motion.div
            key="offer-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{
              backgroundColor: "rgba(0,0,0,0.75)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => setOfferModal(false)}
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Make an Offer</h2>
                <button
                  onClick={() => setOfferModal(false)}
                  className="text-dark-400 hover:text-white transition-colors"
                >
                  <FiX size={20} />
                </button>
              </div>

              {/* Amount input with WETH indicator */}
              <div className="mb-4">
                <label className="text-dark-400 text-sm mb-2 block">Amount</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    className="input-field w-full pr-24"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">W</span>
                    </div>
                    <span className="text-pink-400 text-sm font-semibold">WETH</span>
                  </div>
                </div>
              </div>

              {/* Expiration select */}
              <div className="mb-6">
                <label className="text-dark-400 text-sm mb-2 block">Offer Expiration</label>
                <select
                  value={offerExpiration}
                  onChange={(e) => setOfferExpiration(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="1 Day">1 Day</option>
                  <option value="3 Days">3 Days</option>
                  <option value="7 Days">7 Days</option>
                  <option value="14 Days">14 Days</option>
                  <option value="30 Days">30 Days</option>
                </select>
              </div>

              {/* Submit button */}
              <button
                onClick={handleOfferSubmit}
                className="btn-primary w-full py-3 text-lg font-semibold"
              >
                Submit Offer
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
