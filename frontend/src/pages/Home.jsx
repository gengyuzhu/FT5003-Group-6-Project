import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  FiArrowRight,
  FiTrendingUp,
  FiZap,
  FiStar,
  FiChevronLeft,
  FiChevronRight,
  FiChevronUp,
  FiChevronDown,
} from "react-icons/fi";
import {
  HiOutlineCube,
  HiOutlineChartBar,
  HiOutlineUsers,
} from "react-icons/hi2";
import {
  getFeaturedNFTs,
  getTrendingCollections,
  PLATFORM_STATS,
} from "@/data/mockData";
// Breadcrumb not used on home page (root)

// ---- data ----
const FEATURED_NFTS = getFeaturedNFTs();
const TRENDING_COLLECTIONS = getTrendingCollections();

const STATS = [
  { label: "Total NFTs", value: PLATFORM_STATS.totalNFTs, icon: HiOutlineCube, suffix: "" },
  { label: "Total Volume", value: PLATFORM_STATS.totalVolume, icon: HiOutlineChartBar, suffix: " ETH" },
  { label: "Total Users", value: PLATFORM_STATS.totalUsers, icon: HiOutlineUsers, suffix: "" },
];

// ---- animated counter ----
function AnimatedCounter({ target, suffix = "", duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

// ---- animation variants ----
const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

// ---- NFT card component (enhanced with glassmorphism glow + image zoom) ----
function NFTCard({ nft }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <Link to={`/nft/${nft.id}`} className="block">
      <motion.div
        whileHover={{ y: -8, scale: 1.03 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="glass-card w-[260px] flex-shrink-0 overflow-hidden cursor-pointer group relative"
        style={{ willChange: "transform" }}
      >
        {/* glassmorphism glow on hover */}
        <div className="absolute -inset-[1px] rounded-[inherit] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br from-primary-400/30 via-purple-500/20 to-pink-500/30 blur-sm" />
        <div className="absolute -inset-[1px] rounded-[inherit] opacity-0 group-hover:opacity-60 transition-opacity duration-500 pointer-events-none bg-gradient-to-br from-primary-400/20 via-transparent to-purple-500/20" />

        {/* image with gradient fallback */}
        <div className="h-56 overflow-hidden relative">
          {!imgFailed ? (
            <img
              src={nft.image}
              alt={nft.name}
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />
          ) : (
            <div
              className={`h-full w-full bg-gradient-to-br ${nft.gradient} flex items-center justify-center transition-transform duration-500 ease-out group-hover:scale-110`}
            >
              <span className="text-white/50 text-6xl font-bold select-none">
                {nft.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
        </div>

        <div className="p-4 space-y-2 relative z-10">
          <h3 className="text-white font-semibold truncate">{nft.name}</h3>
          <p className="text-dark-400 text-sm truncate">by {nft.creator}</p>
          <div className="flex items-center justify-between pt-1">
            <span className="gradient-text font-bold">{nft.type === "auction" ? nft.currentBid : nft.price} ETH</span>
            <span className="text-primary-400 text-sm flex items-center gap-1">
              View <FiArrowRight size={14} />
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ---- carousel constants ----
const CARDS_PER_PAGE = 4;
const AUTO_PLAY_MS = 4000;
const TOTAL_PAGES = Math.ceil(FEATURED_NFTS.length / CARDS_PER_PAGE);

// ---- main component ----
export default function Home() {
  const [currentPage, setCurrentPage] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(0);

  const goToPage = useCallback((page) => {
    setCurrentPage(((page % TOTAL_PAGES) + TOTAL_PAGES) % TOTAL_PAGES);
    setProgress(0);
  }, []);

  const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
  const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);

  // Auto-play + progress bar
  useEffect(() => {
    if (isHovered) return;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = now - start;
      const pct = Math.min(elapsed / AUTO_PLAY_MS, 1);
      setProgress(pct);
      if (pct < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        nextPage();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [currentPage, isHovered, nextPage]);

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-dark-950"
    >
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* decorative blobs */}
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />

        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight"
        >
          <span className="gradient-text">
            Discover, Collect &amp; Sell{" "}
          </span>
          <br />
          <span className="text-white">Extraordinary NFTs</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="mt-6 text-dark-300 text-lg max-w-2xl mx-auto"
        >
          The premier decentralised marketplace for unique digital assets.
          Mint, list, auction and trade NFTs with zero hassle.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-8 flex justify-center gap-4 flex-wrap"
        >
          <Link to="/explore" className="btn-primary inline-flex items-center gap-2 px-8 py-3 text-lg">
            <FiZap /> Explore
          </Link>
          <Link to="/create" className="btn-secondary inline-flex items-center gap-2 px-8 py-3 text-lg">
            <FiStar /> Create
          </Link>
        </motion.div>
      </section>

      {/* ============ STATS BAR ============ */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4 mb-16">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="glass-card grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-dark-800"
        >
          {STATS.map((s) => (
            <motion.div
              key={s.label}
              variants={fadeUp}
              className="flex flex-col items-center py-8 gap-2"
            >
              <s.icon className="text-primary-400 text-3xl" />
              <span className="text-3xl font-bold text-white">
                <AnimatedCounter target={s.value} suffix={s.suffix} />
              </span>
              <span className="text-dark-400 text-sm">{s.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ============ FEATURED NFTs ============ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FiStar className="text-primary-400" /> Featured NFTs
          </h2>
          <div className="flex gap-2">
            <button
              onClick={prevPage}
              className="p-2 glass-card hover:bg-dark-800 transition-colors rounded-lg"
            >
              <FiChevronLeft className="text-white" />
            </button>
            <button
              onClick={nextPage}
              className="p-2 glass-card hover:bg-dark-800 transition-colors rounded-lg"
            >
              <FiChevronRight className="text-white" />
            </button>
          </div>
        </div>

        {/* Carousel viewport */}
        <div
          className="overflow-hidden"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <motion.div
            className="flex gap-5"
            animate={{ x: -currentPage * (260 + 20) * CARDS_PER_PAGE }}
            initial={false}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          >
            {FEATURED_NFTS.map((nft) => (
              <NFTCard key={nft.id} nft={nft} />
            ))}
          </motion.div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 h-[3px] w-full bg-dark-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary-500 to-purple-500 rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
            <button
              key={i}
              onClick={() => goToPage(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                i === currentPage
                  ? "bg-primary-400 scale-125"
                  : "bg-dark-600 hover:bg-dark-400"
              }`}
              aria-label={`Go to page ${i + 1}`}
            />
          ))}
        </div>
      </section>

      {/* ============ TRENDING COLLECTIONS ============ */}
      <TrendingCollections />
    </motion.div>
  );
}

// ---- Mini sparkline SVG ----
function MiniSparkline({ data, positive }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 36;
  const pad = 2;
  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const color = positive ? "#4ade80" : "#f87171";

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---- Change cell helper ----
function ChangeCell({ value }) {
  if (!value) return <span className="text-dark-500">0.0%</span>;
  const num = parseFloat(value);
  if (num === 0) return <span className="text-dark-400">0.0%</span>;
  const isPos = num > 0;
  return (
    <span className={`flex items-center justify-end gap-0.5 ${isPos ? "text-green-400" : "text-red-400"}`}>
      {isPos ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
      {value.replace("+", "").replace("-", "")}
    </span>
  );
}

// ---- Time filter tabs ----
const TIME_FILTERS = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

// ---- Trending Collections component ----
function TrendingCollections() {
  const navigate = useNavigate();
  const [timeFilter, setTimeFilter] = useState("24h");
  const [imgErrors, setImgErrors] = useState({});

  // Sort collections by selected time filter's change % (highest first)
  const sorted = [...TRENDING_COLLECTIONS].sort((a, b) => {
    const getChange = (c) => {
      const key = timeFilter === "24h" ? "change24h" : timeFilter === "7d" ? "change7d" : "change30d";
      return parseFloat(c[key] || "0");
    };
    return getChange(b) - getChange(a);
  });

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
      {/* header + filter tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FiTrendingUp className="text-primary-400" /> Trending Collections
        </h2>
        <div className="flex items-center gap-1 bg-dark-800/60 rounded-xl p-1 border border-dark-700/50">
          {TIME_FILTERS.map((tf) => (
            <button
              key={tf.key}
              onClick={() => setTimeFilter(tf.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                timeFilter === tf.key
                  ? "bg-primary-500/20 text-primary-400 shadow-sm"
                  : "text-dark-400 hover:text-white hover:bg-dark-700/50"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="text-dark-400 text-xs uppercase tracking-wider border-b border-dark-800">
              <th className="text-left px-4 py-3 w-12">#</th>
              <th className="text-left px-4 py-3">Collection</th>
              <th className="text-right px-4 py-3">Floor Price</th>
              <th className="text-right px-4 py-3">24h %</th>
              <th className="text-right px-4 py-3">7d %</th>
              <th className="text-right px-4 py-3">30d %</th>
              <th className="text-center px-4 py-3">Last 7 Days</th>
              <th className="text-right px-4 py-3">Market Cap</th>
              <th className="text-right px-4 py-3">Volume</th>
              <th className="text-right px-4 py-3">Sales</th>
            </tr>
          </thead>
          <AnimatePresence mode="wait">
            <motion.tbody
              key={timeFilter}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {sorted.map((collection, i) => {
                const sparkPositive = (collection.sparkline?.[collection.sparkline.length - 1] || 0) >= (collection.sparkline?.[0] || 0);
                const hasImgError = imgErrors[collection.id];

                return (
                  <motion.tr
                    key={collection.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04, ease: "easeOut" }}
                    className="border-b border-dark-800/40 last:border-b-0 hover:bg-dark-800/40 transition-colors duration-200 group cursor-pointer"
                    onClick={() => navigate(`/collection/${collection.slug}`)}
                  >
                    {/* Rank */}
                    <td className="px-4 py-4">
                      <span className="text-dark-400 font-medium">{i + 1}</span>
                    </td>

                    {/* Collection */}
                    <td className="px-4 py-4">
                      <Link to={`/collection/${collection.slug}`} className="flex items-center gap-3">
                        {!hasImgError ? (
                          <img
                            src={collection.image}
                            alt={collection.name}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-dark-700 group-hover:ring-primary-500/40 transition-all duration-300 flex-shrink-0"
                            onError={() => setImgErrors((prev) => ({ ...prev, [collection.id]: true }))}
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${collection.bannerGradient} ring-2 ring-dark-700 group-hover:ring-primary-500/40 transition-all duration-300 flex-shrink-0`} />
                        )}
                        <div className="min-w-0">
                          <span className="text-white font-semibold truncate block group-hover:text-primary-300 transition-colors duration-200">
                            {collection.name}
                          </span>
                        </div>
                      </Link>
                    </td>

                    {/* Floor Price */}
                    <td className="px-4 py-4 text-right">
                      <div className="text-white font-semibold text-sm">{collection.floorPrice} ETH</div>
                      <div className="text-dark-500 text-xs">${collection.floorPriceUsd}</div>
                    </td>

                    {/* 24h */}
                    <td className="px-4 py-4 text-right text-sm font-medium">
                      <ChangeCell value={collection.change24h} />
                    </td>

                    {/* 7d */}
                    <td className="px-4 py-4 text-right text-sm font-medium">
                      <ChangeCell value={collection.change7d} />
                    </td>

                    {/* 30d */}
                    <td className="px-4 py-4 text-right text-sm font-medium">
                      <ChangeCell value={collection.change30d} />
                    </td>

                    {/* Sparkline */}
                    <td className="px-4 py-4">
                      <div className="flex justify-center">
                        <MiniSparkline data={collection.sparkline} positive={sparkPositive} />
                      </div>
                    </td>

                    {/* Market Cap */}
                    <td className="px-4 py-4 text-right">
                      <div className="text-white text-sm font-medium">${collection.marketCap}</div>
                      <div className="text-dark-500 text-xs">{collection.marketCapEth} ETH</div>
                    </td>

                    {/* Volume */}
                    <td className="px-4 py-4 text-right">
                      <div className="text-white text-sm font-medium">{collection.volume24h} ETH</div>
                      <div className="text-dark-500 text-xs">${collection.volume24hUsd}</div>
                    </td>

                    {/* Sales */}
                    <td className="px-4 py-4 text-right text-dark-300 text-sm">
                      {collection.sales24h > 0 ? collection.sales24h : "-"}
                    </td>
                  </motion.tr>
                );
              })}
            </motion.tbody>
          </AnimatePresence>
        </table>
      </div>

      {/* View All button */}
      <div className="flex justify-center mt-8">
        <Link
          to="/explore"
          className="group inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-dark-800/80 hover:bg-primary-600/20 border border-dark-700 hover:border-primary-500/50 text-white font-semibold transition-all duration-300 hover:shadow-[0_0_25px_rgba(139,92,246,0.25)]"
        >
          View All Collections
          <FiArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}
