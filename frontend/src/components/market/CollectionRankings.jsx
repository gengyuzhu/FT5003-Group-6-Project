import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiTrendingUp,
  FiChevronUp,
  FiChevronDown,
  FiArrowRight,
} from "react-icons/fi";
import { COLLECTIONS } from "@/data/mockData";

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

function computeTrendScore(c) {
  const ch24 = parseFloat(c.change24h || "0");
  const vol = parseFloat(c.volume24h || "0");
  const sales = c.sales24h || 0;
  return (ch24 * 4 + Math.min(vol, 100) * 0.3 + sales * 1.5).toFixed(1);
}

export default function CollectionRankings() {
  const [rankSort, setRankSort] = useState("trend");
  const [imgErrors, setImgErrors] = useState({});

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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
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
                      transition={{ duration: 0.25, delay: i * 0.04 }}
                      className="border-b border-dark-800/40 last:border-b-0 hover:bg-dark-800/40 transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <span className="text-dark-500 text-sm">{i + 1}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/collection/${c.slug}`} className="flex items-center gap-2.5">
                          {!hasImgError ? (
                            <img
                              src={c.image}
                              alt={c.name}
                              className="w-8 h-8 rounded-full object-cover ring-1 ring-dark-700 flex-shrink-0"
                              onError={() =>
                                setImgErrors((prev) => ({ ...prev, [c.id]: true }))
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
                        <span className="text-white text-sm font-medium">{c.floorPrice}</span>
                        <span className="text-dark-500 text-xs ml-1">ETH</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`text-sm font-medium flex items-center justify-end gap-0.5 ${
                            ch >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {ch >= 0 ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                          {c.change24h?.replace("+", "").replace("-", "")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <MiniSparkline data={c.sparkline} positive={sparkPos} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {rankSort === "trend" ? (
                          <span className="text-primary-400 font-bold text-sm">{c.trendScore}</span>
                        ) : (
                          <span className="text-white text-sm">{c.volume24h} ETH</span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </AnimatePresence>
          </table>
        </div>
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
  );
}
