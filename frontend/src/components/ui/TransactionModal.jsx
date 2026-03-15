import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiCheckCircle,
  FiLoader,
  FiExternalLink,
  FiXCircle,
} from "react-icons/fi";
import { HiOutlineWallet } from "react-icons/hi2";

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.3 } },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.85, y: 30 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 25 },
  },
  exit: { opacity: 0, scale: 0.9, y: 20, transition: { duration: 0.25 } },
};

const STAGES = [
  {
    key: "wallet",
    label: "Waiting for Wallet Approval...",
    icon: HiOutlineWallet,
    duration: 1500,
  },
  {
    key: "pending",
    label: "Transaction Pending on Blockchain...",
    icon: FiLoader,
    duration: 2500,
  },
  {
    key: "success",
    label: "Success!",
    icon: FiCheckCircle,
    duration: 2000,
  },
  {
    key: "error",
    label: "Transaction Failed",
    icon: FiXCircle,
    duration: null,
  },
];

const MOCK_TX_HASH = "0x7a9f3b2c8d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a";

export default function TransactionModal({
  isOpen,
  onClose,
  onComplete,
  title = "Processing Transaction",
  simulateError = false,
}) {
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setStageIndex(0);
      setProgress(0);
      return;
    }

    // error stage — no auto-advance, requires user action
    if (stageIndex === 3) return;

    let timeout;
    let rafId;
    const stage = STAGES[stageIndex];

    if (stageIndex < 2) {
      // animate progress bar during pending stage
      if (stageIndex === 1) {
        const startTime = Date.now();
        const tick = () => {
          const elapsed = Date.now() - startTime;
          const pct = Math.min((elapsed / stage.duration) * 100, 100);
          setProgress(pct);
          if (elapsed < stage.duration) {
            rafId = requestAnimationFrame(tick);
          }
        };
        rafId = requestAnimationFrame(tick);
      }

      timeout = setTimeout(() => {
        // after pending stage, go to error if simulateError is true
        if (stageIndex === 1 && simulateError) {
          setStageIndex(3);
        } else {
          setStageIndex((prev) => prev + 1);
        }
        setProgress(0);
      }, stage.duration);
    } else if (stageIndex === 2) {
      // success stage — auto dismiss
      timeout = setTimeout(() => {
        onComplete?.();
        onClose?.();
      }, stage.duration);
    }

    return () => {
      clearTimeout(timeout);
      if (rafId) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stageIndex]);

  const stage = STAGES[stageIndex] || STAGES[0];
  const StageIcon = stage.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="tx-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{
            backgroundColor: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
          }}
        >
          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-sm rounded-2xl border border-dark-700 bg-dark-900 p-8 shadow-2xl"
          >
            {/* title */}
            <p className="text-dark-400 text-xs uppercase tracking-wider text-center mb-6">
              {title}
            </p>

            {/* icon */}
            <div className="flex justify-center mb-5">
              {stageIndex === 3 ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.6, times: [0, 0.6, 1] }}
                  className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center"
                >
                  <FiXCircle className="text-red-400 text-3xl" />
                </motion.div>
              ) : stageIndex === 2 ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.6, times: [0, 0.6, 1] }}
                  className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center"
                >
                  <FiCheckCircle className="text-green-400 text-3xl" />
                </motion.div>
              ) : (
                <motion.div
                  animate={
                    stageIndex === 0
                      ? { scale: [1, 1.1, 1] }
                      : { rotate: 360 }
                  }
                  transition={
                    stageIndex === 0
                      ? { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
                      : { repeat: Infinity, duration: 1, ease: "linear" }
                  }
                  className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center"
                >
                  <StageIcon className="text-primary-400 text-3xl" />
                </motion.div>
              )}
            </div>

            {/* label */}
            <h3
              className={`text-center font-semibold text-lg mb-4 ${
                stageIndex === 3
                  ? "text-red-400"
                  : stageIndex === 2
                  ? "text-green-400"
                  : "text-white"
              }`}
            >
              {stage.label}
            </h3>

            {/* progress bar (only in pending stage) */}
            {stageIndex === 1 && (
              <div className="w-full h-2 rounded-full bg-dark-800 overflow-hidden mb-4">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, #8b5cf6, #6366f1, #3b82f6)",
                    width: `${progress}%`,
                  }}
                />
              </div>
            )}

            {/* tx hash (pending & success) */}
            {stageIndex >= 1 && stageIndex <= 2 && (
              <div className="flex items-center justify-center gap-2 text-dark-500 text-xs">
                <span className="font-mono">
                  {MOCK_TX_HASH.slice(0, 10)}...{MOCK_TX_HASH.slice(-6)}
                </span>
                <FiExternalLink size={11} className="text-dark-600" />
              </div>
            )}

            {/* success subtext */}
            {stageIndex === 2 && (
              <p className="text-dark-400 text-sm text-center mt-3">
                Transaction confirmed on the blockchain.
              </p>
            )}

            {/* error subtext & actions */}
            {stageIndex === 3 && (
              <>
                <p className="text-dark-400 text-sm text-center mt-1 mb-6">
                  User rejected the request or insufficient gas.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setStageIndex(0);
                      setProgress(0);
                    }}
                    className="btn-primary flex-1"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => onClose?.()}
                    className="btn-secondary flex-1"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
