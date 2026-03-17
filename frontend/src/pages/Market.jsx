import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  FiDollarSign,
  FiActivity,
  FiUsers,
} from "react-icons/fi";
import {
  HiOutlineChartBar,
  HiOutlineCube,
} from "react-icons/hi2";
import Breadcrumb from "@/components/ui/Breadcrumb";
import OracleDashboard from "@/components/oracle/OracleDashboard";
import OracleAttackSimulator from "@/components/oracle/OracleAttackSimulator";
import OracleEducationPanel from "@/components/oracle/OracleEducationPanel";
import FearGreedGauge from "@/components/market/FearGreedGauge";
import StatCard from "@/components/market/StatCard";
import TopSalesCarousel from "@/components/market/TopSalesCarousel";
import CollectionRankings from "@/components/market/CollectionRankings";
import MarketPulse from "@/components/market/MarketPulse";
import KeyInsights from "@/components/market/KeyInsights";
import { useOracle } from "@/hooks/useOracle";
import { COLLECTIONS } from "@/data/mockData";

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

// ---- Base market data ----
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
  const [value, setValue] = useState(target);
  const rafRef = useRef(null);
  const prevTargetRef = useRef(target);

  useEffect(() => {
    const from = prevTargetRef.current;
    prevTargetRef.current = target;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
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

const SPARK_HISTORY_MAX = 12;

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
    capHistory: [BASE_MARKET_CAP],
    volHistory: [BASE_24H_VOLUME],
    salesHistory: [BASE_24H_SALES],
    floorHistory: [BASE_AVG_FLOOR],
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        const jitter = (base, pct = 0.008) =>
          base * (1 + (Math.random() - 0.5) * 2 * pct);
        const newCap = jitter(prev.marketCap, 0.003);
        const newVol = jitter(prev.volume, 0.012);
        const newFloor = jitter(prev.avgFloor, 0.005);
        const newSales = prev.sales + (Math.random() > 0.7 ? 1 : 0);

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
          salesTrend: `${newSales >= BASE_24H_SALES ? "+" : "-"}${Math.abs(((newSales - BASE_24H_SALES) / BASE_24H_SALES) * 100).toFixed(1)}%`,
          floorTrend: `${floorDir}${Math.abs(((newFloor - BASE_AVG_FLOOR) / BASE_AVG_FLOOR) * 100).toFixed(1)}%`,
          lastUpdated: Date.now(),
          capHistory: [...prev.capHistory, newCap].slice(-SPARK_HISTORY_MAX),
          volHistory: [...prev.volHistory, newVol].slice(-SPARK_HISTORY_MAX),
          salesHistory: [...prev.salesHistory, newSales].slice(-SPARK_HISTORY_MAX),
          floorHistory: [...prev.floorHistory, newFloor].slice(-SPARK_HISTORY_MAX),
        };
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return data;
}

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

// ---- Main Market Page ----
export default function Market() {
  const { oracleState, setMode: setOracleMode, toggleMalicious, resetNetwork, ethUsdPrice } = useOracle();
  const liveData = useLiveMarketData();
  const lastUpdated = useTimeAgo(liveData.lastUpdated);

  const animatedCap = useAnimatedValue(liveData.marketCap);
  const animatedVol = useAnimatedValue(liveData.volume);
  const animatedSales = useAnimatedValue(liveData.sales);
  const animatedFloor = useAnimatedValue(liveData.avgFloor);

  const fearGreedScore = useMemo(
    () => computeFearGreed(liveData.volume, liveData.sales),
    [liveData.volume, liveData.sales]
  );

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-dark-950 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Market" }]} />

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
          <span className="ml-3 text-xs text-dark-500">Updated {lastUpdated}</span>
        </motion.p>
      </div>

      {/* Top Row: Fear & Greed + Stats */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10"
      >
        <motion.div variants={fadeUp} className="lg:col-span-4 glass-card p-6 flex items-center justify-center">
          <FearGreedGauge score={fearGreedScore} />
        </motion.div>

        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            icon={FiDollarSign}
            label="Total Market Cap"
            value={`$${(animatedCap / 1e6).toFixed(1)}M`}
            sub={`${COLLECTIONS.reduce((s, c) => s + parseFloat(c.marketCapEth || "0"), 0).toLocaleString()} ETH`}
            trend={liveData.capTrend}
            sparkData={liveData.capHistory}
          />
          <StatCard
            icon={FiActivity}
            label="24h Volume"
            value={`${animatedVol.toFixed(1)} ETH`}
            sub={`$${(animatedVol * ethUsdPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            trend={liveData.volTrend}
            badge="Oracle Price Feed"
            sparkData={liveData.volHistory}
          />
          <StatCard
            icon={HiOutlineCube}
            label="24h Sales"
            value={Math.round(animatedSales).toString()}
            sub={`${COLLECTIONS.length} collections`}
            trend={liveData.salesTrend}
            sparkData={liveData.salesHistory}
          />
          <StatCard
            icon={FiUsers}
            label="Avg Floor Price"
            value={`${animatedFloor.toFixed(2)} ETH`}
            sub={`$${(animatedFloor * ethUsdPrice).toFixed(0)}`}
            trend={liveData.floorTrend}
            badge="Oracle Price Feed"
            sparkData={liveData.floorHistory}
          />
        </div>
      </motion.div>

      {/* Oracle Attack Simulator */}
      <OracleAttackSimulator
        oracleState={oracleState}
        onSetMode={setOracleMode}
        onToggleMalicious={toggleMalicious}
        onReset={resetNetwork}
      />

      {/* Oracle Price Feed Demo */}
      <OracleDashboard
        oracleState={oracleState}
        onSetMode={setOracleMode}
        onToggleMalicious={toggleMalicious}
        onReset={resetNetwork}
      />
      <OracleEducationPanel />

      {/* Two Columns: Rankings + Top Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
        <CollectionRankings />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-5 space-y-6"
        >
          <TopSalesCarousel />
          <MarketPulse />
        </motion.div>
      </div>

      {/* Key Insights */}
      <KeyInsights />
    </motion.div>
  );
}
