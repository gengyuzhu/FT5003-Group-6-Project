import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiZap,
  FiShoppingCart,
  FiTag,
  FiDollarSign,
  FiFilter,
  FiChevronDown,
  FiClock,
} from "react-icons/fi";
import {
  HiOutlineBolt,
  HiOutlineSparkles,
} from "react-icons/hi2";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { MOCK_GLOBAL_ACTIVITY, getNFTById } from "@/data/mockData";

// ---- mock events ----
const EVENT_TYPES = {
  mint: { label: "Mint", icon: HiOutlineSparkles, color: "text-green-400", bg: "bg-green-400/10" },
  sale: { label: "Sale", icon: FiShoppingCart, color: "text-blue-400", bg: "bg-blue-400/10" },
  list: { label: "Listing", icon: FiTag, color: "text-yellow-400", bg: "bg-yellow-400/10" },
  bid: { label: "Bid", icon: FiDollarSign, color: "text-purple-400", bg: "bg-purple-400/10" },
  transfer: { label: "Transfer", icon: FiZap, color: "text-cyan-400", bg: "bg-cyan-400/10" },
};

// Map global activity to the display format — use each NFT's actual gradient
const MOCK_EVENTS = MOCK_GLOBAL_ACTIVITY.map((e) => {
  const nftData = getNFTById(e.nftId);
  return {
    id: e.id,
    type: e.event.toLowerCase() === "listing" ? "list" : e.event.toLowerCase(),
    nft: e.nft,
    nftId: e.nftId,
    nftImage: nftData?.image || null,
    from: e.from,
    to: e.to,
    price: e.price !== "--" ? e.price.replace(" ETH", "") : null,
    time: e.time,
    gradient: nftData?.gradient || "from-primary-500 to-purple-500",
  };
});

// animation variants
const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const rowVariant = {
  hidden: { opacity: 0, x: -16 },
  visible: (i) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.05, duration: 0.35 },
  }),
};

// skeleton
function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 animate-pulse">
      <div className="w-10 h-10 bg-dark-800 rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-dark-800 rounded w-1/3" />
        <div className="h-3 bg-dark-800 rounded w-1/5" />
      </div>
      <div className="h-4 bg-dark-800 rounded w-16" />
    </div>
  );
}

export default function Activity() {
  const [filter, setFilter] = useState("all");
  const [loading] = useState(false);
  const [imgErrors, setImgErrors] = useState({});

  const filtered =
    filter === "all"
      ? MOCK_EVENTS
      : MOCK_EVENTS.filter((e) => e.type === filter);

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-dark-950 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Activity" }]} />

      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl sm:text-4xl font-extrabold text-white flex items-center gap-3"
          >
            <HiOutlineBolt className="text-primary-400" /> Activity
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-dark-400 mt-2"
          >
            Real-time marketplace events
          </motion.p>
        </div>

        {/* filter dropdown */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative"
        >
          <FiFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input-field pl-10 pr-10 appearance-none cursor-pointer"
          >
            <option value="all">All Events</option>
            <option value="mint">Mints</option>
            <option value="sale">Sales</option>
            <option value="list">Listings</option>
            <option value="bid">Bids</option>
            <option value="transfer">Transfers</option>
          </select>
          <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" />
        </motion.div>
      </div>

      {/* live indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="flex items-center gap-2 mb-6"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
        <span className="text-dark-400 text-sm">Live updates</span>
      </motion.div>

      {/* event list */}
      {loading ? (
        <div className="glass-card overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          {/* table header (desktop) */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-dark-400 text-xs uppercase tracking-wider border-b border-dark-800">
            <span className="col-span-1">Type</span>
            <span className="col-span-3">NFT</span>
            <span className="col-span-2">From</span>
            <span className="col-span-2">To</span>
            <span className="col-span-2 text-right">Price</span>
            <span className="col-span-2 text-right">Time</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={filter}>
              {filtered.length === 0 ? (
                <p className="text-dark-500 text-center py-16">
                  No events matching this filter.
                </p>
              ) : (
                filtered.map((evt, i) => {
                  const meta = EVENT_TYPES[evt.type];
                  const Icon = meta.icon;

                  return (
                    <motion.div
                      key={evt.id}
                      custom={i}
                      variants={rowVariant}
                      initial="hidden"
                      animate="visible"
                      className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 items-center px-6 py-4 border-b border-dark-800/50 last:border-b-0 hover:bg-dark-800/30 transition-colors ${
                        i % 2 === 0 ? "bg-dark-900/20" : ""
                      }`}
                    >
                      {/* type icon */}
                      <div className="col-span-1 flex items-center gap-3 md:gap-0">
                        <div
                          className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}
                        >
                          <Icon className={`${meta.color} text-lg`} />
                        </div>
                        <span className={`md:hidden ${meta.color} font-medium text-sm ml-2`}>
                          {meta.label}
                        </span>
                      </div>

                      {/* nft */}
                      <div className="col-span-3 flex items-center gap-3">
                        {evt.nftImage && !imgErrors[evt.id] ? (
                          <img
                            src={evt.nftImage}
                            alt={evt.nft}
                            className="hidden md:block w-8 h-8 rounded-lg object-cover flex-shrink-0"
                            onError={() => setImgErrors((prev) => ({ ...prev, [evt.id]: true }))}
                          />
                        ) : (
                          <div
                            className={`hidden md:block w-8 h-8 rounded-lg bg-gradient-to-br ${evt.gradient} flex-shrink-0`}
                          />
                        )}
                        <Link
                          to={`/nft/${evt.nftId}`}
                          className="text-white font-medium truncate text-sm hover:text-primary-400 transition-colors"
                        >
                          {evt.nft}
                        </Link>
                      </div>

                      {/* from */}
                      <div className="col-span-2">
                        <span className="md:hidden text-dark-500 text-xs mr-1">From:</span>
                        <span className="text-dark-300 font-mono text-sm">
                          {evt.from}
                        </span>
                      </div>

                      {/* to */}
                      <div className="col-span-2">
                        <span className="md:hidden text-dark-500 text-xs mr-1">To:</span>
                        <span className="text-dark-300 font-mono text-sm">
                          {evt.to || "--"}
                        </span>
                      </div>

                      {/* price */}
                      <div className="col-span-2 text-right">
                        {evt.price ? (
                          <span className="gradient-text font-bold text-sm">
                            {evt.price} ETH
                          </span>
                        ) : (
                          <span className="text-dark-500 text-sm">--</span>
                        )}
                      </div>

                      {/* time */}
                      <div className="col-span-2 text-right text-dark-400 text-sm flex items-center justify-end gap-1">
                        <FiClock className="w-3 h-3" />
                        {evt.time}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* summary cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-10"
      >
        {[
          { label: "Mints", count: MOCK_EVENTS.filter((e) => e.type === "mint").length, icon: HiOutlineSparkles, color: "text-green-400" },
          { label: "Sales", count: MOCK_EVENTS.filter((e) => e.type === "sale").length, icon: FiShoppingCart, color: "text-blue-400" },
          { label: "Listings", count: MOCK_EVENTS.filter((e) => e.type === "list").length, icon: FiTag, color: "text-yellow-400" },
          { label: "Bids", count: MOCK_EVENTS.filter((e) => e.type === "bid").length, icon: FiDollarSign, color: "text-purple-400" },
          { label: "Transfers", count: MOCK_EVENTS.filter((e) => e.type === "transfer").length, icon: FiZap, color: "text-cyan-400" },
        ].map((s) => (
          <div key={s.label} className="glass-card p-5 text-center space-y-2">
            <s.icon className={`${s.color} text-2xl mx-auto`} />
            <p className="text-2xl font-bold text-white">{s.count}</p>
            <p className="text-dark-400 text-sm">{s.label}</p>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
