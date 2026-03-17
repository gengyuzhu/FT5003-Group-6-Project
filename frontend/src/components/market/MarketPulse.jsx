import { useMemo } from "react";
import { motion } from "framer-motion";
import { FiActivity } from "react-icons/fi";
import { MOCK_GLOBAL_ACTIVITY } from "@/data/mockData";

const PULSE_ITEMS = [
  { label: "Mints", event: "Mint", color: "#4ade80" },
  { label: "Sales", event: "Sale", color: "#60a5fa" },
  { label: "Listings", event: "Listing", color: "#facc15" },
  { label: "Bids", event: "Bid", color: "#c084fc" },
  { label: "Transfers", event: "Transfer", color: "#22d3ee" },
];

export default function MarketPulse() {
  const items = useMemo(
    () =>
      PULSE_ITEMS.map((item) => ({
        ...item,
        count: MOCK_GLOBAL_ACTIVITY.filter((e) => e.event === item.event).length,
      })),
    []
  );

  return (
    <div>
      <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
        <FiActivity className="text-primary-400" /> Market Pulse
      </h3>
      <div className="glass-card p-4 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-dark-300 text-sm">{item.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-24 h-1.5 bg-dark-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: item.color }}
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
  );
}
