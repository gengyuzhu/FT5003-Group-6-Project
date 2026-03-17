import { motion } from "framer-motion";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

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

export default function StatCard({ icon: Icon, label, value, sub, trend, badge, sparkData }) {
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
      {sparkData && sparkData.length > 1 && (
        <MiniSparkline data={sparkData} positive={isPos} />
      )}
      {sub && <p className="text-dark-500 text-xs">{sub}</p>}
      {badge && (
        <div className="flex items-center gap-1 text-[10px] text-primary-400/70 mt-0.5">
          <span className="w-1 h-1 rounded-full bg-primary-400/50" />
          {badge}
        </div>
      )}
    </motion.div>
  );
}
