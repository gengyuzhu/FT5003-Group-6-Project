import { useMemo } from "react";
import { motion } from "framer-motion";
import { FiTrendingUp, FiTrendingDown, FiDollarSign } from "react-icons/fi";
import { HiOutlineBolt } from "react-icons/hi2";
import { COLLECTIONS } from "@/data/mockData";

export default function KeyInsights() {
  const mostActive = useMemo(
    () => [...COLLECTIONS].sort((a, b) => (b.sales24h || 0) - (a.sales24h || 0))[0],
    []
  );
  const highestFloor = useMemo(
    () => [...COLLECTIONS].sort((a, b) => parseFloat(b.floorPrice) - parseFloat(a.floorPrice))[0],
    []
  );
  const biggestDecline = useMemo(
    () => [...COLLECTIONS].sort((a, b) => parseFloat(a.change24h || "0") - parseFloat(b.change24h || "0"))[0],
    []
  );

  const insights = [
    {
      title: "Most Active Collection",
      value: mostActive?.name || "--",
      sub: `${mostActive?.sales24h || 0} sales today`,
      icon: FiTrendingUp,
      positive: true,
    },
    {
      title: "Highest Floor",
      value: highestFloor?.name || "--",
      sub: `${highestFloor?.floorPrice || "0"} ETH`,
      icon: FiDollarSign,
      positive: true,
    },
    {
      title: "Biggest Decline (24h)",
      value: biggestDecline?.name || "--",
      sub: biggestDecline?.change24h || "0%",
      icon: FiTrendingDown,
      positive: false,
    },
  ];

  return (
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
        {insights.map((insight) => (
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
  );
}
