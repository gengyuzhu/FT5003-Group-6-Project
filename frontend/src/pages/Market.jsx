import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiTrendingUp,
  FiTrendingDown,
  FiDollarSign,
  FiActivity,
  FiUsers,
  FiChevronUp,
  FiChevronDown,
  FiArrowRight,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import {
  HiOutlineChartBar,
  HiOutlineCube,
  HiOutlineBolt,
} from "react-icons/hi2";
import Breadcrumb from "@/components/ui/Breadcrumb";
import {
  COLLECTIONS,
  getTrendingCollections,
  ALL_NFTS,
  MOCK_GLOBAL_ACTIVITY,
  PLATFORM_STATS,
  getNFTById,
} from "@/data/mockData";

// ---- animation variants ----
const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

// ---- Base market data from mock (used as baseline for live simulation) ----
const BASE_MARKET_CAP = COLLECTIONS.reduce(
  (sum, c) => sum + parseFloat(c.marketCap?.replace(/,/g, "") || "0"),
  0
);
const BASE_24H_VOLUME = COLLECTIONS.reduce(
  (sum, c) => sum + parseFloat(c.volume24h || "0"),
  0
);
const BASE_24H_SALES = COLLECTIONS.reduce(
  (sum, c) => sum + (c.sales24h || 0),
  0
);
const BASE_AVG_FLOOR =
  COLLECTIONS.reduce((s, c) => s + parseFloat(c.floorPrice), 0) /
  COLLECTIONS.length;

// Fear & Greed calculation based on market signals
function computeFearGreed(volume, sales) {
  let score = 50;
  const volFactor = Math.min(volume / 100, 20);
  score += volFactor;
  const avgChange =
    COLLECTIONS.reduce((s, c) => s + parseFloat(c.change24h || "0"), 0) /
    COLLECTIONS.length;
  score += avgChange * 5;
  const salesFactor = Math.min(sales / 5, 15);
  score += salesFactor;
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ---- Animated count-up hook ----
function useAnimatedValue(target, duration = 1200) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}

// ---- Hook for simulated live data fluctuations ----
function useLiveMarketData() {
  const [data, setData] = useState({
    marketCap: BASE_MARKET_CAP,
    volume: BASE_24H_VOLUME,
    sales: BASE_24H_SALES,
    avgFloor: BASE_AVG_FLOOR,
    capTrend: "+3.2%",
    volTrend: "+8.5%",
    salesTrend: "+12.1%",
    floorTrend: "-1.4%",
    lastUpdated: Date.now(),
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        // Small random fluctuations (±0.3% – ±1.5%)
        const jitter = (base, pct = 0.008) =>
          base * (1 + (Math.random() - 0.5) * 2 * pct);
        const newCap = jitter(prev.marketCap, 0.003);
        const newVol = jitter(prev.volume, 0.012);
        const newFloor = jitter(prev.avgFloor, 0.005);
        // Sales can tick up by 0 or 1 occasionally
        const newSales =
          prev.sales + (Math.random() > 0.7 ? 1 : 0);

        // Update trend badges based on direction vs baseline
        const capDir = newCap >= BASE_MARKET_CAP ? "+" : "-";
        const volDir = newVol >= BASE_24H_VOLUME ? "+" : "-";
        const floorDir = newFloor >= BASE_AVG_FLOOR ? "+" : "-";

        return {
          marketCap: newCap,
          volume: newVol,
          sales: newSales,
          avgFloor: newFloor,
          capTrend: `${capDir}${Math.abs(((newCap - BASE_MARKET_CAP) / BASE_MARKET_CAP) * 100).toFixed(1)}%`,
          volTrend: `${volDir}${Math.abs(((newVol - BASE_24H_VOLUME) / BASE_24H_VOLUME) * 100).toFixed(1)}%`,
          salesTrend: `+${(((newSales - BASE_24H_SALES) / BASE_24H_SALES) * 100).toFixed(1)}%`,
          floorTrend: `${floorDir}${Math.abs(((newFloor - BASE_AVG_FLOOR) / BASE_AVG_FLOOR) * 100).toFixed(1)}%`,
          lastUpdated: Date.now(),
        };
      });
    }, 4000); // Update every 4 seconds

    return () => clearInterval(interval);
  }, []);

  return data;
}

// ---- Time ago formatter ----
function useTimeAgo(timestamp) {
  const [text, setText] = useState("just now");

  useEffect(() => {
    const update = () => {
      const diff = Math.floor((Date.now() - timestamp) / 1000);
      if (diff < 5) setText("just now");
      else if (diff < 60) setText(`${diff}s ago`);
      else setText(`${Math.floor(diff / 60)}m ago`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return text;
}

function getFearGreedLabel(score) {
  if (score <= 20) return { label: "Extreme Fear", color: "#ef4444" };
  if (score <= 40) return { label: "Fear", color: "#f97316" };
  if (score <= 60) return { label: "Neutral", color: "#eab308" };
  if (score <= 80) return { label: "Greed", color: "#84cc16" };
  return { label: "Extreme Greed", color: "#22c55e" };
}

// ---- Fear & Greed Gauge Component ----
function FearGreedGauge({ score }) {
  const { label, color } = getFearGreedLabel(score);
  // SVG arc gauge
  const radius = 80;
  const strokeWidth = 14;
  const circumference = Math.PI * radius; // half circle
  const fillPercent = score / 100;
  const dashOffset = circumference * (1 - fillPercent);

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="120" viewBox="0 0 200 120">
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        {/* Filled arc */}
        <motion.path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
        {/* Score text */}
        <text
          x="100"
          y="85"
          textAnchor="middle"
          className="fill-white text-3xl font-bold"
          style={{ fontSize: "36px", fontWeight: 800 }}
        >
          {score}
        </text>
        {/* Min / Max labels */}
        <text x="20" y="115" textAnchor="middle" className="fill-gray-500" style={{ fontSize: "10px" }}>
          0
        </text>
        <text x="180" y="115" textAnchor="middle" className="fill-gray-500" style={{ fontSize: "10px" }}>
          100
        </text>
      </svg>
      <span
        className="text-sm font-bold mt-1 px-3 py-1 rounded-full"
        style={{ color, backgroundColor: `${color}15` }}
      >
        {label}
      </span>
      <p className="text-dark-500 text-xs mt-2">NFT Market Sentiment</p>
    </div>
  );
}

// ---- Mini sparkline ----
function MiniSparkline({ data, positive }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
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

// ---- Stat Card ----
function StatCard({ icon: Icon, label, value, sub, trend }) {
  const isPos = trend && parseFloat(trend) > 0;
  return (
    <motion.div
      variants={fadeUp}
      className="glass-card p-5 space-y-2"
    >
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
          <Icon className="text-primary-400 text-lg" />
        </div>
        {trend && (
          <span
            className={`text-xs font-medium flex items-center gap-0.5 px-2 py-0.5 rounded-full ${
              isPos
                ? "text-green-400 bg-green-400/10"
                : "text-red-400 bg-red-400/10"
            }`}
          >
            {isPos ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
            {trend.replace("+", "").replace("-", "")}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-dark-400 text-sm">{label}</p>
      {sub && <p className="text-dark-500 text-xs">{sub}</p>}
    </motion.div>
  );
}

// ---- Top Sales Carousel ----
function TopSalesCarousel() {
  const [page, setPage] = useState(0);

  // Get top sales from activity
  const topSales = useMemo(() => {
    return MOCK_GLOBAL_ACTIVITY
      .filter((e) => e.event === "Sale")
      .map((e) => {
        const nft = getNFTById(e.nftId);
        return {
          ...e,
          image: nft?.image,
          gradient: nft?.gradient || "from-primary-500 to-purple-500",
          collection: nft?.collectionSlug,
        };
      })
      .sort(
        (a, b) =>
          parseFloat(b.price.replace(" ETH", "")) -
          parseFloat(a.price.replace(" ETH", ""))
      );
  }, []);

  const perPage = 4;
  const totalPages = Math.ceil(topSales.length / perPage);
  const visible = topSales.slice(page * perPage, (page + 1) * perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <HiOutlineBolt className="text-primary-400" /> Top Sales
        </h3>
        {totalPages > 1 && (
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 glass-card rounded-lg hover:bg-dark-700 disabled:opacity-30 transition-all"
            >
              <FiChevronLeft size={14} className="text-white" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1.5 glass-card rounded-lg hover:bg-dark-700 disabled:opacity-30 transition-all"
            >
              <FiChevronRight size={14} className="text-white" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <AnimatePresence mode="wait">
          {visible.map((sale, i) => (
            <motion.div
              key={`${sale.id}-${page}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link
                to={`/nft/${sale.nftId}`}
                className="glass-card overflow-hidden group cursor-pointer block hover:border-primary-500/30 transition-all duration-300"
              >
                <div className="h-32 overflow-hidden relative">
                  {sale.image ? (
                    <img
                      src={sale.image}
                      alt={sale.nft}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div
                      className={`w-full h-full bg-gradient-to-br ${sale.gradient} flex items-center justify-center`}
                    >
                      <span className="text-white/30 text-4xl font-bold">
                        {sale.nft.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-white text-xs font-semibold truncate">
                      {sale.nft}
                    </p>
                  </div>
                </div>
                <div className="p-3">
                  <p className="gradient-text font-bold text-sm">
                    {sale.price}
                  </p>
                  <p className="text-dark-500 text-xs mt-0.5">{sale.time}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---- TrendScore computation ----
function computeTrendScore(c) {
  // Weighted combination: 24h change (40%), 7d volume momentum (30%), sales activity (30%)
  const ch24 = parseFloat(c.change24h || "0");
  const vol = parseFloat(c.volume24h || "0");
  const sales = c.sales24h || 0;
  return (ch24 * 4 + Math.min(vol, 100) * 0.3 + sales * 1.5).toFixed(1);
}

// ---- Main Market Page ----
export default function Market() {
  const [rankSort, setRankSort] = useState("trend"); // trend | volume | floor
  const [imgErrors, setImgErrors] = useState({});

  // Live simulated market data — fluctuates every 4s
  const liveData = useLiveMarketData();
  const lastUpdated = useTimeAgo(liveData.lastUpdated);

  // Animated count-up values
  const animatedCap = useAnimatedValue(liveData.marketCap);
  const animatedVol = useAnimatedValue(liveData.volume);
  const animatedSales = useAnimatedValue(liveData.sales);
  const animatedFloor = useAnimatedValue(liveData.avgFloor);

  // Fear & Greed computed from live data
  const fearGreedScore = useMemo(
    () => computeFearGreed(liveData.volume, liveData.sales),
    [liveData.volume, liveData.sales]
  );

  const collections = useMemo(() => {
    const withScore = COLLECTIONS.map((c) => ({
      ...c,
      trendScore: parseFloat(computeTrendScore(c)),
    }));

    if (rankSort === "trend")
      return [...withScore].sort((a, b) => b.trendScore - a.trendScore);
    if (rankSort === "volume")
      return [...withScore].sort(
        (a, b) => parseFloat(b.volume24h) - parseFloat(a.volume24h)
      );
    return [...withScore].sort(
      (a, b) => parseFloat(b.floorPrice) - parseFloat(a.floorPrice)
    );
  }, [rankSort]);

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-dark-950 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      <Breadcrumb
        items={[{ label: "Home", to: "/" }, { label: "Market" }]}
      />

      {/* Header */}
      <div className="mb-10">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl sm:text-4xl font-extrabold text-white flex items-center gap-3"
        >
          <HiOutlineChartBar className="text-primary-400" /> Market Overview
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-dark-400 mt-2"
        >
          Real-time NFT market analytics and sentiment
          <span className="ml-3 text-xs text-dark-500">
            Updated {lastUpdated}
          </span>
        </motion.p>
      </div>

      {/* ====== Top Row: Fear & Greed + Stats ====== */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10"
      >
        {/* Fear & Greed Card */}
        <motion.div
          variants={fadeUp}
          className="lg:col-span-4 glass-card p-6 flex items-center justify-center"
        >
          <FearGreedGauge score={fearGreedScore} />
        </motion.div>

        {/* Stats Grid */}
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={FiDollarSign}
            label="Total Market Cap"
            value={`$${(animatedCap / 1e6).toFixed(1)}M`}
            sub={`${COLLECTIONS.reduce((s, c) => s + parseFloat(c.marketCapEth || "0"), 0).toLocaleString()} ETH`}
            trend={liveData.capTrend}
          />
          <StatCard
            icon={FiActivity}
            label="24h Volume"
            value={`${animatedVol.toFixed(1)} ETH`}
            sub={`$${(animatedVol * 2091).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            trend={liveData.volTrend}
          />
          <StatCard
            icon={HiOutlineCube}
            label="24h Sales"
            value={Math.round(animatedSales).toString()}
            sub={`${COLLECTIONS.length} collections`}
            trend={liveData.salesTrend}
          />
          <StatCard
            icon={FiUsers}
            label="Avg Floor Price"
            value={`${animatedFloor.toFixed(2)} ETH`}
            sub={`$${(animatedFloor * 2091).toFixed(0)}`}
            trend={liveData.floorTrend}
          />
        </div>
      </motion.div>

      {/* ====== Two Columns: Rankings + Top Sales ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
        {/* Collection Rankings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-7"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FiTrendingUp className="text-primary-400" /> Collection Rankings
            </h3>
            <div className="flex items-center gap-1 bg-dark-800/60 rounded-lg p-0.5 border border-dark-700/50">
              {[
                { key: "trend", label: "Trend" },
                { key: "volume", label: "Volume" },
                { key: "floor", label: "Floor" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRankSort(opt.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    rankSort === opt.key
                      ? "bg-primary-500/20 text-primary-400"
                      : "text-dark-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-dark-400 text-xs uppercase tracking-wider border-b border-dark-800">
                  <th className="text-left px-4 py-2.5 w-10">#</th>
                  <th className="text-left px-4 py-2.5">Collection</th>
                  <th className="text-right px-4 py-2.5">Floor</th>
                  <th className="text-right px-4 py-2.5">24h %</th>
                  <th className="text-center px-4 py-2.5">7d</th>
                  <th className="text-right px-4 py-2.5">
                    {rankSort === "trend" ? "Score" : "Volume"}
                  </th>
                </tr>
              </thead>
              <AnimatePresence mode="wait">
                <motion.tbody
                  key={rankSort}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {collections.map((c, i) => {
                    const ch = parseFloat(c.change24h || "0");
                    const sparkPos =
                      (c.sparkline?.[c.sparkline.length - 1] || 0) >=
                      (c.sparkline?.[0] || 0);
                    const hasImgError = imgErrors[c.id];

                    return (
                      <motion.tr
                        key={c.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.25,
                          delay: i * 0.04,
                        }}
                        className="border-b border-dark-800/40 last:border-b-0 hover:bg-dark-800/40 transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <span className="text-dark-500 text-sm">{i + 1}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/collection/${c.slug}`}
                            className="flex items-center gap-2.5"
                          >
                            {!hasImgError ? (
                              <img
                                src={c.image}
                                alt={c.name}
                                className="w-8 h-8 rounded-full object-cover ring-1 ring-dark-700 flex-shrink-0"
                                onError={() =>
                                  setImgErrors((prev) => ({
                                    ...prev,
                                    [c.id]: true,
                                  }))
                                }
                              />
                            ) : (
                              <div
                                className={`w-8 h-8 rounded-full bg-gradient-to-br ${c.bannerGradient} ring-1 ring-dark-700 flex-shrink-0`}
                              />
                            )}
                            <span className="text-white text-sm font-medium truncate group-hover:text-primary-300 transition-colors">
                              {c.name}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-white text-sm font-medium">
                            {c.floorPrice}
                          </span>
                          <span className="text-dark-500 text-xs ml-1">ETH</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`text-sm font-medium flex items-center justify-end gap-0.5 ${
                              ch >= 0 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {ch >= 0 ? (
                              <FiChevronUp size={13} />
                            ) : (
                              <FiChevronDown size={13} />
                            )}
                            {c.change24h
                              ?.replace("+", "")
                              .replace("-", "")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <MiniSparkline
                              data={c.sparkline}
                              positive={sparkPos}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {rankSort === "trend" ? (
                            <span className="text-primary-400 font-bold text-sm">
                              {c.trendScore}
                            </span>
                          ) : (
                            <span className="text-white text-sm">
                              {c.volume24h} ETH
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </motion.tbody>
              </AnimatePresence>
            </table>
          </div>

          <div className="flex justify-center mt-4">
            <Link
              to="/explore"
              className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
            >
              View All Collections <FiArrowRight size={14} />
            </Link>
          </div>
        </motion.div>

        {/* Right Column: Top Sales + Market Pulse */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-5 space-y-6"
        >
          {/* Top Sales */}
          <TopSalesCarousel />

          {/* Market Pulse — Activity Summary */}
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
              <FiActivity className="text-primary-400" /> Market Pulse
            </h3>
            <div className="glass-card p-4 space-y-3">
              {[
                {
                  label: "Mints",
                  count: MOCK_GLOBAL_ACTIVITY.filter(
                    (e) => e.event === "Mint"
                  ).length,
                  color: "text-green-400",
                  bg: "bg-green-400/10",
                },
                {
                  label: "Sales",
                  count: MOCK_GLOBAL_ACTIVITY.filter(
                    (e) => e.event === "Sale"
                  ).length,
                  color: "text-blue-400",
                  bg: "bg-blue-400/10",
                },
                {
                  label: "Listings",
                  count: MOCK_GLOBAL_ACTIVITY.filter(
                    (e) => e.event === "Listing"
                  ).length,
                  color: "text-yellow-400",
                  bg: "bg-yellow-400/10",
                },
                {
                  label: "Bids",
                  count: MOCK_GLOBAL_ACTIVITY.filter(
                    (e) => e.event === "Bid"
                  ).length,
                  color: "text-purple-400",
                  bg: "bg-purple-400/10",
                },
                {
                  label: "Transfers",
                  count: MOCK_GLOBAL_ACTIVITY.filter(
                    (e) => e.event === "Transfer"
                  ).length,
                  color: "text-cyan-400",
                  bg: "bg-cyan-400/10",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-2 h-2 rounded-full ${item.bg} ${item.color}`}
                      style={{
                        backgroundColor:
                          item.color === "text-green-400"
                            ? "#4ade80"
                            : item.color === "text-blue-400"
                            ? "#60a5fa"
                            : item.color === "text-yellow-400"
                            ? "#facc15"
                            : item.color === "text-purple-400"
                            ? "#c084fc"
                            : "#22d3ee",
                      }}
                    />
                    <span className="text-dark-300 text-sm">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-dark-800 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor:
                            item.color === "text-green-400"
                              ? "#4ade80"
                              : item.color === "text-blue-400"
                              ? "#60a5fa"
                              : item.color === "text-yellow-400"
                              ? "#facc15"
                              : item.color === "text-purple-400"
                              ? "#c084fc"
                              : "#22d3ee",
                        }}
                        initial={{ width: 0 }}
                        animate={{
                          width: `${(item.count / MOCK_GLOBAL_ACTIVITY.length) * 100}%`,
                        }}
                        transition={{ duration: 0.8, delay: 0.5 }}
                      />
                    </div>
                    <span className="text-white text-sm font-medium w-6 text-right">
                      {item.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ====== Bottom: Key Insights ====== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-6"
      >
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <HiOutlineBolt className="text-primary-400" /> Key Insights
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              title: "Most Active Collection",
              value:
                [...COLLECTIONS].sort(
                  (a, b) => (b.sales24h || 0) - (a.sales24h || 0)
                )[0]?.name || "--",
              sub: `${[...COLLECTIONS].sort((a, b) => (b.sales24h || 0) - (a.sales24h || 0))[0]?.sales24h || 0} sales today`,
              icon: FiTrendingUp,
              positive: true,
            },
            {
              title: "Highest Floor",
              value:
                [...COLLECTIONS].sort(
                  (a, b) =>
                    parseFloat(b.floorPrice) - parseFloat(a.floorPrice)
                )[0]?.name || "--",
              sub: `${[...COLLECTIONS].sort((a, b) => parseFloat(b.floorPrice) - parseFloat(a.floorPrice))[0]?.floorPrice || "0"} ETH`,
              icon: FiDollarSign,
              positive: true,
            },
            {
              title: "Biggest Decline (24h)",
              value:
                [...COLLECTIONS].sort(
                  (a, b) =>
                    parseFloat(a.change24h || "0") -
                    parseFloat(b.change24h || "0")
                )[0]?.name || "--",
              sub:
                [...COLLECTIONS].sort(
                  (a, b) =>
                    parseFloat(a.change24h || "0") -
                    parseFloat(b.change24h || "0")
                )[0]?.change24h || "0%",
              icon: FiTrendingDown,
              positive: false,
            },
          ].map((insight) => (
            <div
              key={insight.title}
              className="bg-dark-800/40 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <insight.icon
                  className={
                    insight.positive ? "text-green-400" : "text-red-400"
                  }
                  size={16}
                />
                <p className="text-dark-400 text-xs uppercase tracking-wider">
                  {insight.title}
                </p>
              </div>
              <p className="text-white font-semibold">{insight.value}</p>
              <p className="text-dark-500 text-xs">{insight.sub}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
