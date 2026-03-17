import { motion } from "framer-motion";

function getFearGreedLabel(score) {
  if (score <= 20) return { label: "Extreme Fear", color: "#ef4444" };
  if (score <= 40) return { label: "Fear", color: "#f97316" };
  if (score <= 60) return { label: "Neutral", color: "#eab308" };
  if (score <= 80) return { label: "Greed", color: "#84cc16" };
  return { label: "Extreme Greed", color: "#22c55e" };
}

export default function FearGreedGauge({ score }) {
  const { label, color } = getFearGreedLabel(score);
  const radius = 80;
  const strokeWidth = 14;
  const circumference = Math.PI * radius;
  const fillPercent = score / 100;
  const dashOffset = circumference * (1 - fillPercent);

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="120" viewBox="0 0 200 120">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
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
        <text
          x="100"
          y="85"
          textAnchor="middle"
          className="fill-white text-3xl font-bold"
          style={{ fontSize: "36px", fontWeight: 800 }}
        >
          {score}
        </text>
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
