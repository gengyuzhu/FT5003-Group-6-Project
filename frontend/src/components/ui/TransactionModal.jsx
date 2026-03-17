import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiCheckCircle,
  FiLoader,
  FiExternalLink,
  FiXCircle,
} from "react-icons/fi";
import { HiOutlineWallet } from "react-icons/hi2";
import { getFriendlyError } from "@/utils/errorMessages";

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

/**
 * TransactionModal - Supports both real wagmi transaction states and mock simulation.
 *
 * Real mode: Pass isPending, isConfirming, isSuccess, error, txHash from wagmi hooks.
 * Mock mode: When no wagmi props are provided, falls back to setTimeout-based simulation.
 */
export default function TransactionModal({
  isOpen,
  onClose,
  onComplete,
  title = "Processing Transaction",
  simulateError = false,
  // Real wagmi transaction state props
  isPending = null,      // wagmi: waiting for user to confirm in wallet
  isConfirming = null,   // wagmi: tx submitted, waiting for block confirmation
  isSuccess = null,      // wagmi: tx confirmed on chain
  error = null,          // wagmi: error object
  txHash = null,         // real transaction hash
  onRetry = null,        // callback to retry the transaction
}) {
  // Determine if we're in real mode (wagmi-driven) or mock mode (timer-based)
  const isRealMode = isPending !== null || isConfirming !== null || isSuccess !== null;

  // ── Real mode: derive stage from wagmi state ──
  const realStageIndex = useMemo(() => {
    if (!isRealMode) return null;
    if (error) return 3;
    if (isSuccess) return 2;
    if (isConfirming) return 1;
    return 0; // isPending or initial
  }, [isRealMode, isPending, isConfirming, isSuccess, error]);

  // ── Mock mode: timer-based stage progression ──
  const [mockStageIndex, setMockStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const onCompleteRef = useRef(onComplete);
  const onCloseRef = useRef(onClose);
  const simulateErrorRef = useRef(simulateError);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { simulateErrorRef.current = simulateError; }, [simulateError]);

  // Mock mode auto-advance
  useEffect(() => {
    if (isRealMode) return;
    if (!isOpen) {
      setMockStageIndex(0);
      setProgress(0);
      return;
    }
    if (mockStageIndex === 3) return;

    let timeout;
    let rafId;
    const stage = STAGES[mockStageIndex];

    if (mockStageIndex < 2) {
      if (mockStageIndex === 1) {
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
        if (mockStageIndex === 1 && simulateErrorRef.current) {
          setMockStageIndex(3);
        } else {
          setMockStageIndex((prev) => prev + 1);
        }
        setProgress(0);
      }, stage.duration);
    } else if (mockStageIndex === 2) {
      timeout = setTimeout(() => {
        onCompleteRef.current?.();
        onCloseRef.current?.();
      }, stage.duration);
    }

    return () => {
      clearTimeout(timeout);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isOpen, mockStageIndex, isRealMode]);

  // Real mode: auto-close on success
  useEffect(() => {
    if (!isRealMode || realStageIndex !== 2) return;
    const timeout = setTimeout(() => {
      onCompleteRef.current?.();
      onCloseRef.current?.();
    }, 2000);
    return () => clearTimeout(timeout);
  }, [isRealMode, realStageIndex]);

  // Reset mock stage when modal opens
  useEffect(() => {
    if (isOpen && !isRealMode) {
      setMockStageIndex(0);
      setProgress(0);
    }
  }, [isOpen, isRealMode]);

  // Escape key to close + focus trap
  const modalRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      // Focus trap: keep Tab within modal
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    // Auto-focus the modal
    if (modalRef.current) {
      const first = modalRef.current.querySelector("button");
      if (first) first.focus();
    }
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const stageIndex = isRealMode ? (realStageIndex ?? 0) : mockStageIndex;
  const stage = STAGES[stageIndex] || STAGES[0];
  const StageIcon = stage.icon;
  const displayHash = txHash || (isRealMode ? null : MOCK_TX_HASH);
  const errorMessage = error ? getFriendlyError(error) : "User rejected the request or insufficient gas.";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="tx-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tx-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{
            backgroundColor: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
          }}
        >
          <motion.div
            ref={modalRef}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full max-w-sm rounded-2xl border border-dark-700 bg-dark-900 p-8 shadow-2xl"
          >
            {/* title */}
            <p id="tx-modal-title" className="text-dark-400 text-xs uppercase tracking-wider text-center mb-6">
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

            {/* progress bar (only in pending stage for mock mode) */}
            {stageIndex === 1 && !isRealMode && (
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

            {/* indeterminate progress for real pending */}
            {stageIndex === 1 && isRealMode && (
              <div className="w-full h-2 rounded-full bg-dark-800 overflow-hidden mb-4">
                <motion.div
                  className="h-full rounded-full w-1/3"
                  style={{
                    background: "linear-gradient(90deg, #8b5cf6, #6366f1, #3b82f6)",
                  }}
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                />
              </div>
            )}

            {/* tx hash (pending & success) */}
            {displayHash && stageIndex >= 1 && stageIndex <= 2 && (
              <a
                href={`https://sepolia.etherscan.io/tx/${displayHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-dark-500 text-xs hover:text-primary-400 transition-colors"
              >
                <span className="font-mono">
                  {displayHash.slice(0, 10)}...{displayHash.slice(-6)}
                </span>
                <FiExternalLink size={11} />
              </a>
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
                  {errorMessage}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (onRetry) {
                        onRetry();
                      } else {
                        setMockStageIndex(0);
                        setProgress(0);
                      }
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
