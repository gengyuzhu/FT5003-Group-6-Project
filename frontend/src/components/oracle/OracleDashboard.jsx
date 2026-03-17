import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiLink,
  FiShield,
  FiRefreshCw,
  FiZap,
  FiServer,
} from "react-icons/fi";
import { HiOutlineGlobeAlt } from "react-icons/hi2";

// ---- animation variants ----
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const nodeCardVariant = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
};

// ---- Mode descriptions ----
const MODE_INFO = {
  centralized: {
    label: "Centralized",
    icon: FiServer,
    color: "text-red-400",
    bgActive: "bg-red-500/20 border-red-500/40",
    desc: "Single oracle node provides the price. Fast but a single point of failure — if this node is compromised, the entire price feed is wrong.",
  },
  average: {
    label: "Simple Average",
    icon: FiRefreshCw,
    color: "text-yellow-400",
    bgActive: "bg-yellow-500/20 border-yellow-500/40",
    desc: "Average of all node prices. Better than single node, but malicious outliers can still skew the result significantly.",
  },
  astrea: {
    label: "ASTREA",
    icon: FiShield,
    color: "text-green-400",
    bgActive: "bg-green-500/20 border-green-500/40",
    desc: "Stake-weighted median with outlier detection & slashing. Malicious nodes are economically punished, ensuring accurate consensus.",
  },
};

// ---- Status badge ----
function StatusBadge({ status }) {
  const config = {
    active: { dot: "bg-green-400", text: "Active", textColor: "text-green-400" },
    malicious: { dot: "bg-red-400", text: "Malicious", textColor: "text-red-400" },
    slashed: { dot: "bg-gray-500", text: "Slashed", textColor: "text-gray-500" },
  };
  const c = config[status] || config.active;
  return (
    <span className={`flex items-center gap-1.5 text-xs ${c.textColor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.text}
    </span>
  );
}

// ---- Reputation bar ----
function ReputationBar({ value }) {
  const color =
    value > 70 ? "bg-green-500" : value > 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="w-full h-1 bg-dark-700 rounded-full overflow-hidden">
      <motion.div
        className={`h-full ${color} rounded-full`}
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.5 }}
      />
    </div>
  );
}

// ---- SVG Price Chart ----
function PriceConsensusChart({ history, nodes, mode }) {
  const W = 800;
  const H = 160;
  const PAD = { top: 15, bottom: 25, left: 60, right: 15 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // Compute price range from history
  const { minP, maxP } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const h of history) {
      if (h.truePrice < min) min = h.truePrice;
      if (h.truePrice > max) max = h.truePrice;
      for (const p of h.nodePrices) {
        if (p !== null) {
          if (p < min) min = p;
          if (p > max) max = p;
        }
      }
    }
    // Add some padding
    const range = max - min || 1;
    return { minP: min - range * 0.15, maxP: max + range * 0.15 };
  }, [history]);

  const scaleX = (i) => PAD.left + (i / Math.max(history.length - 1, 1)) * chartW;
  const scaleY = (price) =>
    PAD.top + chartH - ((price - minP) / (maxP - minP || 1)) * chartH;

  // Build consensus line path
  const consensusKey =
    mode === "centralized"
      ? "centralizedResult"
      : mode === "average"
      ? "averageResult"
      : "astreaResult";

  const consensusPath = history
    .map((h, i) => `${i === 0 ? "M" : "L"}${scaleX(i).toFixed(1)},${scaleY(h[consensusKey]).toFixed(1)}`)
    .join(" ");

  const truePricePath = history
    .map((h, i) => `${i === 0 ? "M" : "L"}${scaleX(i).toFixed(1)},${scaleY(h.truePrice).toFixed(1)}`)
    .join(" ");

  // Latest round node dots
  const latestRound = history[history.length - 1];
  const latestIdx = history.length - 1;

  // ASTREA tolerance band for latest
  const astreaMedian = latestRound?.astreaResult;
  const bandTop = astreaMedian ? scaleY(astreaMedian * 1.02) : 0;
  const bandBottom = astreaMedian ? scaleY(astreaMedian * 0.98) : 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = PAD.top + frac * chartH;
        const price = maxP - frac * (maxP - minP);
        return (
          <g key={frac}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={0.5}
            />
            <text
              x={PAD.left - 5}
              y={y + 3}
              textAnchor="end"
              fill="rgba(255,255,255,0.3)"
              fontSize="9"
              fontFamily="monospace"
            >
              ${price.toFixed(0)}
            </text>
          </g>
        );
      })}

      {/* ASTREA tolerance band */}
      {mode === "astrea" && astreaMedian && (
        <rect
          x={PAD.left}
          y={bandTop}
          width={chartW}
          height={Math.max(0, bandBottom - bandTop)}
          fill="rgba(34,197,94,0.06)"
          stroke="rgba(34,197,94,0.15)"
          strokeWidth={0.5}
          strokeDasharray="4 2"
          rx={2}
        />
      )}

      {/* True price line (dashed green) */}
      <path
        d={truePricePath}
        fill="none"
        stroke="rgba(34,197,94,0.5)"
        strokeWidth={1.5}
        strokeDasharray="6 3"
      />

      {/* Consensus price line (solid purple) */}
      <path
        d={consensusPath}
        fill="none"
        stroke="rgba(168,85,247,0.9)"
        strokeWidth={2}
      />

      {/* Node dots for latest round */}
      {latestRound &&
        latestRound.nodePrices.map((price, i) => {
          if (price === null) return null;
          const node = nodes[i];
          const isOutlier = latestRound.outlierNodeIds.includes(node.id);
          const isMalicious = node.status === "malicious";
          const x = scaleX(latestIdx);
          const y = scaleY(price);

          return (
            <g key={node.id}>
              {/* Outlier circle highlight */}
              {isOutlier && mode === "astrea" && (
                <circle
                  cx={x}
                  cy={y}
                  r={8}
                  fill="none"
                  stroke="rgba(239,68,68,0.6)"
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={4}
                fill={
                  isMalicious || node.status === "slashed"
                    ? "rgba(239,68,68,0.9)"
                    : "rgba(96,165,250,0.9)"
                }
              />
            </g>
          );
        })}

      {/* Legend */}
      <g transform={`translate(${PAD.left + 5}, ${H - 8})`}>
        <line x1={0} y1={0} x2={16} y2={0} stroke="rgba(34,197,94,0.5)" strokeWidth={1.5} strokeDasharray="4 2" />
        <text x={20} y={3} fill="rgba(255,255,255,0.4)" fontSize="8">True Price</text>
        <line x1={90} y1={0} x2={106} y2={0} stroke="rgba(168,85,247,0.9)" strokeWidth={2} />
        <text x={110} y={3} fill="rgba(255,255,255,0.4)" fontSize="8">Consensus</text>
        <circle cx={190} cy={0} r={3} fill="rgba(96,165,250,0.9)" />
        <text x={196} y={3} fill="rgba(255,255,255,0.4)" fontSize="8">Honest Node</text>
        <circle cx={275} cy={0} r={3} fill="rgba(239,68,68,0.9)" />
        <text x={281} y={3} fill="rgba(255,255,255,0.4)" fontSize="8">Malicious</text>
      </g>
    </svg>
  );
}

// ---- Accuracy Badge ----
function AccuracyBadge({ value }) {
  const color =
    value >= 99
      ? "text-green-400 bg-green-500/10"
      : value >= 95
      ? "text-yellow-400 bg-yellow-500/10"
      : "text-red-400 bg-red-500/10";
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${color}`}>
      {value.toFixed(1)}%
    </span>
  );
}

// ======== MAIN DASHBOARD ========
export default function OracleDashboard({
  oracleState,
  onSetMode,
  onToggleMalicious,
  onReset,
}) {
  const { nodes, mode, currentTruePrice, consensusPrice, confidence, history, accuracy } =
    oracleState;

  const deviation = currentTruePrice
    ? (((consensusPrice - currentTruePrice) / currentTruePrice) * 100).toFixed(3)
    : "0.000";

  const modeInfo = MODE_INFO[mode];

  // Network health stats
  const activeCount = nodes.filter((n) => n.status === "active").length;
  const maliciousCount = nodes.filter((n) => n.status === "malicious").length;
  const slashedCount = nodes.filter((n) => n.status === "slashed").length;
  const totalStake = nodes.reduce((s, n) => s + n.stake, 0);

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="mb-10"
    >
      {/* ---- Section Header ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <HiOutlineGlobeAlt className="text-primary-400" />
            Oracle Price Feed
            <span className="text-xs font-normal text-dark-400 ml-2">
              ETH/USD Decentralized Oracle Demo
            </span>
          </h2>
          <p className="text-sm text-dark-400 mt-1">
            How does our marketplace get reliable off-chain price data? Click nodes to simulate attacks.
          </p>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark-300 border border-dark-700 rounded-lg hover:text-white hover:border-dark-500 transition-colors"
        >
          <FiRefreshCw size={12} />
          Reset Network
        </button>
      </div>

      {/* ---- Network Health Bar ---- */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          {activeCount} Active
        </span>
        {maliciousCount > 0 && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            {maliciousCount} Malicious
          </motion.span>
        )}
        {slashedCount > 0 && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-600/50 text-dark-400 border border-dark-600/30"
          >
            {slashedCount} Slashed
          </motion.span>
        )}
        <span className="text-dark-500 ml-auto">
          Total Stake: <span className="text-dark-300 font-mono">{totalStake.toFixed(0)} ETH</span>
        </span>
      </div>

      {/* ---- Section A: Mode Selector ---- */}
      <div className="glass-card p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-3">
          <span className="text-xs text-dark-400 font-medium uppercase tracking-wider whitespace-nowrap">
            Aggregation Mode:
          </span>
          <div className="bg-dark-800/60 rounded-lg p-0.5 border border-dark-700/50 flex gap-0.5">
            {Object.entries(MODE_INFO).map(([key, info]) => {
              const Icon = info.icon;
              const isActive = mode === key;
              return (
                <button
                  key={key}
                  onClick={() => onSetMode(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? `${info.bgActive} ${info.color} border`
                      : "text-dark-400 hover:text-white border border-transparent"
                  }`}
                >
                  <Icon size={12} />
                  {info.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode description */}
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.2 }}
            className={`text-xs px-3 py-2 rounded-lg border ${modeInfo.bgActive}`}
          >
            <p className={`${modeInfo.color} font-medium mb-0.5`}>
              {modeInfo.label} Oracle
            </p>
            <p className="text-dark-300">{modeInfo.desc}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---- Section B: Node Grid ---- */}
      <div className="glass-card p-4 mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <FiZap className="text-primary-400" size={14} />
          Oracle Nodes
          <span className="text-xs text-dark-400 font-normal">
            (click to toggle malicious)
          </span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {nodes.map((node) => {
            const isOutlier =
              history.length > 0 &&
              history[history.length - 1].outlierNodeIds.includes(node.id);

            return (
              <motion.div
                key={node.id}
                variants={nodeCardVariant}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onToggleMalicious(node.id)}
                className={`relative cursor-pointer rounded-lg p-2.5 border transition-all duration-300 ${
                  node.status === "malicious"
                    ? "bg-red-500/5 border-red-500/40 hover:border-red-500/60"
                    : node.status === "slashed"
                    ? "bg-dark-800/30 border-dark-700/30 opacity-50"
                    : "bg-dark-800/40 border-dark-700/50 hover:border-primary-500/30"
                }`}
              >
                {/* Outlier flash indicator */}
                {isOutlier && mode === "astrea" && (
                  <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.5 }}
                    className="absolute inset-0 rounded-lg bg-red-500/10 border border-red-500/30"
                  />
                )}

                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-white truncate">
                    {node.status === "slashed" ? (
                      <s className="text-dark-500">{node.name}</s>
                    ) : (
                      node.name
                    )}
                  </span>
                  <StatusBadge status={node.status} />
                </div>

                {/* Price */}
                <motion.div
                  key={node.latestPrice}
                  initial={{ scale: 1.08 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`text-sm font-mono font-bold mb-1.5 ${
                    node.status === "malicious"
                      ? "text-red-400"
                      : node.status === "slashed"
                      ? "text-dark-500"
                      : "text-white"
                  }`}
                >
                  ${node.latestPrice.toFixed(2)}
                </motion.div>

                {/* Stake + Reputation */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-dark-400">
                    <span>Stake: {node.stake.toFixed(0)} ETH</span>
                    <span>Rep: {node.reputation}</span>
                  </div>
                  <ReputationBar value={node.reputation} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ---- Section C: Price Consensus Chart ---- */}
      <div className="glass-card p-4 mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
          <FiLink className="text-primary-400" size={14} />
          Price Consensus — Last {history.length} Rounds
        </h3>
        <PriceConsensusChart history={history} nodes={nodes} mode={mode} />
      </div>

      {/* ---- Section D: Result Comparison ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(MODE_INFO).map(([key, info]) => {
          const Icon = info.icon;
          const isActive = mode === key;
          const price =
            history.length > 0
              ? key === "centralized"
                ? history[history.length - 1].centralizedResult
                : key === "average"
                ? history[history.length - 1].averageResult
                : history[history.length - 1].astreaResult
              : 0;
          const dev = currentTruePrice
            ? (((price - currentTruePrice) / currentTruePrice) * 100).toFixed(3)
            : "0.000";
          const acc = accuracy[key] || 0;

          return (
            <motion.div
              key={key}
              whileHover={{ scale: 1.02 }}
              className={`glass-card p-4 border transition-all duration-300 ${
                isActive
                  ? `${info.bgActive} shadow-lg`
                  : "border-dark-700/50"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className={info.color} />
                <span className={`text-xs font-semibold ${isActive ? info.color : "text-dark-300"}`}>
                  {info.label}
                </span>
                {isActive && (
                  <span className="text-[10px] bg-primary-500/20 text-primary-400 px-1.5 py-0.5 rounded-full ml-auto">
                    ACTIVE
                  </span>
                )}
              </div>

              <div className="text-lg font-mono font-bold text-white mb-1">
                ${price.toFixed(2)}
              </div>

              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-mono ${
                    Math.abs(parseFloat(dev)) < 0.1
                      ? "text-green-400"
                      : Math.abs(parseFloat(dev)) < 1
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {parseFloat(dev) >= 0 ? "+" : ""}
                  {dev}% dev
                </span>
                <AccuracyBadge value={acc} />
              </div>

              <div className="text-[10px] text-dark-500 mt-1.5">
                Accuracy over {history.length} rounds
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Confidence indicator */}
      <div className="mt-3 flex items-center gap-4 text-xs text-dark-400">
        <span>
          Consensus Confidence:{" "}
          <span
            className={`font-mono font-semibold ${
              confidence > 90
                ? "text-green-400"
                : confidence > 70
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {confidence}%
          </span>
        </span>
        <span>
          True Price:{" "}
          <span className="font-mono text-green-400/70">
            ${currentTruePrice.toFixed(2)}
          </span>
        </span>
        <span>
          Deviation:{" "}
          <span
            className={`font-mono ${
              Math.abs(parseFloat(deviation)) < 0.1
                ? "text-green-400"
                : "text-red-400"
            }`}
          >
            {parseFloat(deviation) >= 0 ? "+" : ""}
            {deviation}%
          </span>
        </span>
      </div>
    </motion.div>
  );
}
