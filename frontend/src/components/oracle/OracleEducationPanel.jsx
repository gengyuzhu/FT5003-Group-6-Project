import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiChevronDown, FiChevronUp, FiBookOpen } from "react-icons/fi";

const SECTIONS = [
  {
    title: "Why does an NFT marketplace need an oracle?",
    icon: "🔗",
    content: [
      "Our marketplace displays prices in both ETH and USD (e.g., \"$389.1M Total Market Cap\"). Smart contracts on Ethereum only know ETH values \u2014 they have no native way to access the real-world ETH/USD exchange rate.",
      "An oracle bridges this gap by bringing off-chain data (market prices, exchange rates, external API data) onto the blockchain in a verifiable way.",
      "Without an oracle, the marketplace would either: (a) hardcode a fixed ETH/USD rate that becomes stale, or (b) rely on a single centralized API that could fail or be manipulated.",
    ],
  },
  {
    title: "The Oracle Problem",
    icon: "\u26a0\ufe0f",
    content: [
      "The Oracle Problem is a fundamental challenge in blockchain: how do you get reliable off-chain data onto a trustless, decentralized network?",
      "A centralized oracle (single data source) introduces a single point of failure \u2014 contradicting blockchain's core principle of decentralization. If the oracle is compromised, all dependent smart contracts are affected.",
      "Try it yourself: in the demo above, switch to \"Centralized\" mode and click on the Singapore node to make it malicious. Watch how the entire price feed becomes unreliable!",
    ],
  },
  {
    title: "ASTREA: Decentralized Oracle Solution",
    icon: "\ud83d\udee1\ufe0f",
    content: [
      "ASTREA solves the oracle problem through economic incentives and decentralized consensus:",
      "1. Multiple Nodes: 7 independent oracle nodes across different geographic locations each submit their price data independently, eliminating single point of failure.",
      "2. Stake-Weighted Median: Instead of a simple average (vulnerable to outliers), ASTREA uses a stake-weighted median \u2014 nodes with more ETH staked have proportionally more influence, aligning economic incentives with honest behavior.",
      "3. Outlier Detection: Any price deviating more than 2% from the median is flagged as an outlier and excluded from the final consensus.",
      "4. Slashing: Outlier nodes are economically punished \u2014 they lose reputation and staked ETH. Repeated violations lead to permanent removal (slashing). This makes attacking the oracle economically irrational.",
      "The result: even with 1\u20132 malicious nodes, ASTREA maintains >99% accuracy, while centralized and simple average approaches degrade significantly.",
    ],
  },
];

export default function OracleEducationPanel() {
  const [expandedIdx, setExpandedIdx] = useState(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mb-10"
    >
      <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
        <FiBookOpen className="text-primary-400" size={14} />
        Understanding the Oracle Problem
        <span className="text-xs text-dark-400 font-normal">
          (click to expand)
        </span>
      </h3>

      <div className="space-y-2">
        {SECTIONS.map((section, idx) => {
          const isOpen = expandedIdx === idx;

          return (
            <div
              key={idx}
              className="glass-card border border-dark-700/50 overflow-hidden"
            >
              <button
                onClick={() => setExpandedIdx(isOpen ? null : idx)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-dark-700/20 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">{section.icon}</span>
                  <span className="text-sm font-medium text-white">
                    {section.title}
                  </span>
                </span>
                {isOpen ? (
                  <FiChevronUp className="text-dark-400" size={14} />
                ) : (
                  <FiChevronDown className="text-dark-400" size={14} />
                )}
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-2.5">
                      {section.content.map((text, i) => (
                        <p
                          key={i}
                          className="text-xs leading-relaxed text-dark-200 pl-6 border-l-2 border-dark-700/50"
                        >
                          {text}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
