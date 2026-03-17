import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiShield,
  FiShieldOff,
  FiAlertTriangle,
  FiRefreshCw,
  FiTarget,
  FiZap,
  FiCircle,
} from "react-icons/fi";
import { HiOutlineBolt } from "react-icons/hi2";

// ---- Step-specific icons ----
const STEP_ICONS = [FiShieldOff, FiAlertTriangle, FiShield];

// ---- Step definitions with sub-conditions ----
const STEPS = [
  {
    id: 0,
    title: "Centralized Failure",
    mode: "centralized",
    colorClass: "text-red-400",
    bgClass: "bg-red-400/10",
    borderClass: "border-red-500/40",
    glowClass: "shadow-red-500/10",
    accentColor: "#f87171",
    instruction:
      "Switch to Centralized mode, then make the Singapore node malicious.",
    hint: "In centralized mode, the entire price feed depends on a single node. If that node is compromised, the oracle fails completely.",
    // Sub-conditions for live checklist
    conditions: (state) => [
      {
        label: "Mode set to Centralized",
        met: state.mode === "centralized",
        action: "centralized",
      },
      {
        label: "Singapore node is malicious",
        met: state.nodes[0]?.status === "malicious",
        action: "toggle-0",
      },
    ],
    check: (state) =>
      state.mode === "centralized" && state.nodes[0]?.status === "malicious",
  },
  {
    id: 1,
    title: "Average Vulnerability",
    mode: "average",
    colorClass: "text-yellow-400",
    bgClass: "bg-yellow-400/10",
    borderClass: "border-yellow-500/40",
    glowClass: "shadow-yellow-500/10",
    accentColor: "#facc15",
    instruction:
      "Switch to Simple Average mode. Make at least 2 nodes malicious.",
    hint: "A naive average is easily skewed by outlier prices. Even one or two malicious nodes can significantly distort the consensus.",
    conditions: (state) => {
      const maliciousCount = state.nodes.filter(
        (n) => n.status === "malicious"
      ).length;
      return [
        {
          label: "Mode set to Simple Average",
          met: state.mode === "average",
          action: "average",
        },
        {
          label: `Malicious nodes: ${maliciousCount}/2`,
          met: maliciousCount >= 2,
          action: "toggle-any",
        },
      ];
    },
    check: (state) =>
      state.mode === "average" &&
      state.nodes.filter((n) => n.status === "malicious").length >= 2,
  },
  {
    id: 2,
    title: "ASTREA Defense",
    mode: "astrea",
    colorClass: "text-green-400",
    bgClass: "bg-green-400/10",
    borderClass: "border-green-500/40",
    glowClass: "shadow-green-500/10",
    accentColor: "#4ade80",
    instruction:
      "Switch to ASTREA mode (keep malicious nodes). Watch ASTREA detect and slash the outliers while maintaining high accuracy.",
    hint: "ASTREA uses stake-weighted median and automatic slashing. Malicious nodes are detected, penalised, and the consensus stays accurate.",
    conditions: (state) => {
      const maliciousCount = state.nodes.filter(
        (n) => n.status === "malicious"
      ).length;
      return [
        {
          label: "Mode set to ASTREA",
          met: state.mode === "astrea",
          action: "astrea",
        },
        {
          label: `Malicious nodes active: ${maliciousCount}/2`,
          met: maliciousCount >= 2,
          action: "toggle-any",
        },
      ];
    },
    check: (state) =>
      state.mode === "astrea" &&
      state.nodes.filter((n) => n.status === "malicious").length >= 2,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

// ---- Countdown ring for auto-advance ----
function CountdownRing({ seconds, total, color }) {
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const progress = seconds / total;

  return (
    <div className="relative w-9 h-9 flex items-center justify-center">
      <svg width="36" height="36" className="rotate-[-90deg]">
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="2.5"
        />
        <motion.circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{ duration: 0.3 }}
        />
      </svg>
      <span className="absolute text-xs font-bold text-white">{seconds}</span>
    </div>
  );
}

// ---- Accuracy bar with animated fill ----
function AccuracyBar({ label, value, color, failed }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-dark-400">{label}</span>
        <span className={`font-mono font-bold ${failed ? "text-red-400" : "text-green-400"}`}>
          {typeof value === "number" ? `${value.toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${typeof value === "number" ? value : 0}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ---- Quick action button ----
function QuickAction({ label, icon: Icon, onClick, done, accent }) {
  return (
    <button
      onClick={onClick}
      disabled={done}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border ${
        done
          ? "bg-green-500/10 border-green-500/30 text-green-400 cursor-default"
          : `bg-dark-800/60 border-dark-700/50 text-dark-300 hover:text-white hover:border-dark-500 hover:bg-dark-800`
      }`}
    >
      {done ? <FiCheckCircle size={13} /> : <Icon size={13} />}
      {label}
    </button>
  );
}

export default function OracleAttackSimulator({
  oracleState,
  onSetMode,
  onToggleMalicious,
  onReset,
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState([false, false, false]);
  const [snapshots, setSnapshots] = useState([null, null, null]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [allDone, setAllDone] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const advanceTimerRef = useRef(null);
  const countdownRef = useRef(null);

  const ADVANCE_DELAY = 3; // seconds

  // Compute live conditions for current step
  const liveConditions = useMemo(() => {
    if (allDone) return [];
    const step = STEPS[currentStep];
    if (!step) return [];
    return step.conditions(oracleState);
  }, [oracleState, currentStep, allDone]);

  // Completion detection — only marks step done & captures snapshot
  useEffect(() => {
    if (allDone) return;
    const step = STEPS[currentStep];
    if (!step || completed[currentStep]) return;

    if (step.check(oracleState)) {
      // Step just completed — capture accuracy snapshot
      const snap = {
        centralized: oracleState.accuracy.centralized,
        average: oracleState.accuracy.average,
        astrea: oracleState.accuracy.astrea,
      };

      setSnapshots((prev) => {
        const next = [...prev];
        next[currentStep] = snap;
        return next;
      });

      setCompleted((prev) => {
        const next = [...prev];
        next[currentStep] = true;
        return next;
      });
    }
  }, [oracleState, currentStep, completed, allDone]);

  // Auto-advance timer — fires when a step becomes completed
  useEffect(() => {
    if (allDone || !completed[currentStep]) return;

    // Start countdown
    setCountdown(ADVANCE_DELAY);
    let remaining = ADVANCE_DELAY;
    countdownRef.current = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current);
      }
    }, 1000);

    // Auto-advance after delay
    advanceTimerRef.current = setTimeout(() => {
      if (currentStep < 2) {
        setCurrentStep((prev) => prev + 1);
      } else {
        setAllDone(true);
      }
      setCountdown(0);
    }, ADVANCE_DELAY * 1000);

    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [completed, currentStep, allDone]);

  const handleRestart = useCallback(() => {
    onReset();
    setCurrentStep(0);
    setCompleted([false, false, false]);
    setSnapshots([null, null, null]);
    setAllDone(false);
    setCountdown(0);
  }, [onReset]);

  // Quick-action handlers
  const handleQuickAction = useCallback(
    (action) => {
      if (action === "centralized" || action === "average" || action === "astrea") {
        onSetMode(action);
      } else if (action === "toggle-0") {
        // Toggle Singapore (node id 1)
        onToggleMalicious(1);
      } else if (action === "toggle-any") {
        // Find first non-malicious, non-slashed node to toggle
        const node = oracleState.nodes.find(
          (n) => n.status === "active"
        );
        if (node) onToggleMalicious(node.id);
      }
    },
    [onSetMode, onToggleMalicious, oracleState.nodes]
  );

  // Progress percentage
  const progressPct = allDone ? 100 : (completed.filter(Boolean).length / 3) * 100;

  if (!isExpanded) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card mb-6 cursor-pointer hover:border-primary-500/20 transition-all"
        onClick={() => setIsExpanded(true)}
      >
        <div className="flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center">
              <FiShield className="text-primary-400 text-lg" />
            </div>
            <div>
              <h3 className="text-white font-bold">Oracle Attack Simulator</h3>
              <p className="text-dark-400 text-xs">
                {allDone
                  ? "Completed! Click to review"
                  : `Step ${currentStep + 1} of 3 — ${STEPS[currentStep]?.title}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Mini progress */}
            <div className="hidden sm:flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    completed[i]
                      ? "bg-green-400"
                      : i === currentStep
                      ? "bg-primary-400"
                      : "bg-dark-600"
                  }`}
                />
              ))}
            </div>
            <FiChevronDown className="text-dark-400" />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card mb-6 overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 pb-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center">
            <FiShield className="text-primary-400 text-lg" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">
              Oracle Attack Simulator
            </h3>
            <p className="text-dark-400 text-sm">
              Experience the Oracle Problem hands-on in 3 steps
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="text-dark-400 hover:text-primary-400 transition-colors p-2 rounded-lg hover:bg-dark-800"
            title="Restart"
          >
            <FiRefreshCw size={16} />
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="text-dark-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-dark-800"
          >
            <FiChevronUp size={16} />
          </button>
        </div>
      </div>

      {/* Step Progress Bar */}
      <div className="px-5 pt-5 pb-2">
        <div className="flex items-center justify-between relative">
          {/* Connecting line */}
          <div className="absolute top-5 left-[40px] right-[40px] h-0.5 bg-dark-700 z-0" />
          <div
            className="absolute top-5 left-[40px] h-0.5 bg-gradient-to-r from-primary-500 to-purple-500 z-0 transition-all duration-700"
            style={{
              width: allDone
                ? "calc(100% - 80px)"
                : `calc(${(currentStep / 2) * 100}% - ${currentStep === 0 ? 0 : 40}px)`,
            }}
          />

          {STEPS.map((step, i) => {
            const isDone = completed[i];
            const isCurrent = i === currentStep && !allDone;
            const StepIcon = STEP_ICONS[i];

            return (
              <div key={step.id} className="flex flex-col items-center z-10">
                <motion.div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                    isDone
                      ? "bg-green-500/20 border-green-500 text-green-400"
                      : isCurrent
                      ? "bg-primary-500/20 border-primary-500 text-primary-400"
                      : "bg-dark-800 border-dark-600 text-dark-500"
                  }`}
                  animate={
                    isCurrent ? { scale: [1, 1.1, 1] } : { scale: 1 }
                  }
                  transition={
                    isCurrent
                      ? { repeat: Infinity, duration: 2, ease: "easeInOut" }
                      : {}
                  }
                >
                  {isDone ? (
                    <FiCheckCircle size={18} />
                  ) : (
                    <StepIcon size={16} />
                  )}
                </motion.div>
                <p
                  className={`text-xs mt-2 font-medium transition-colors ${
                    isDone
                      ? "text-green-400"
                      : isCurrent
                      ? "text-white"
                      : "text-dark-500"
                  }`}
                >
                  {step.title}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current Step or Completion */}
      <div className="p-5">
        <AnimatePresence mode="wait">
          {allDone ? (
            /* ---- Completion Summary ---- */
            <motion.div
              key="done"
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <div className="text-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.6, times: [0, 0.6, 1] }}
                  className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3"
                >
                  <FiCheckCircle className="text-green-400 text-3xl" />
                </motion.div>
                <h4 className="text-xl font-bold text-white">
                  Oracle Problem — Solved!
                </h4>
                <p className="text-dark-400 text-sm mt-1">
                  ASTREA&apos;s decentralized consensus withstands malicious
                  nodes
                </p>
              </div>

              {/* Accuracy comparison with animated bars */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  {
                    label: "Centralized",
                    accuracy: snapshots[0]?.centralized ?? null,
                    failed: true,
                    color: "#f87171",
                    icon: FiShieldOff,
                    desc: "Single point of failure",
                  },
                  {
                    label: "Simple Average",
                    accuracy: snapshots[1]?.average ?? null,
                    failed: true,
                    color: "#facc15",
                    icon: FiAlertTriangle,
                    desc: "Vulnerable to outliers",
                  },
                  {
                    label: "ASTREA",
                    accuracy: snapshots[2]?.astrea ?? null,
                    failed: false,
                    color: "#4ade80",
                    icon: FiShield,
                    desc: "Resilient consensus",
                  },
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 20, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.15 * idx, duration: 0.4 }}
                      className={`rounded-xl p-4 text-center border ${
                        item.failed
                          ? "bg-red-500/5 border-red-500/20"
                          : "bg-green-500/5 border-green-500/20"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center ${
                          item.failed ? "bg-red-500/10" : "bg-green-500/10"
                        }`}
                      >
                        <Icon
                          size={16}
                          className={item.failed ? "text-red-400" : "text-green-400"}
                        />
                      </div>
                      <p className="text-dark-400 text-xs uppercase tracking-wider mb-1">
                        {item.label}
                      </p>
                      <p
                        className={`text-2xl font-bold ${
                          item.failed ? "text-red-400" : "text-green-400"
                        }`}
                      >
                        {typeof item.accuracy === "number"
                          ? `${item.accuracy}%`
                          : "—"}
                      </p>
                      {/* Accuracy visual bar */}
                      <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden mt-2">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: item.color }}
                          initial={{ width: 0 }}
                          animate={{
                            width: `${typeof item.accuracy === "number" ? item.accuracy : 0}%`,
                          }}
                          transition={{
                            duration: 0.8,
                            delay: 0.3 + idx * 0.15,
                          }}
                        />
                      </div>
                      <p className="text-dark-500 text-[10px] mt-2">
                        {item.desc}
                      </p>
                    </motion.div>
                  );
                })}
              </div>

              {/* Key takeaway */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="bg-dark-800/40 rounded-xl p-4 mb-4"
              >
                <p className="text-dark-300 text-sm leading-relaxed">
                  <strong className="text-white">Key Takeaway:</strong>{" "}
                  Centralized oracles fail catastrophically when their single
                  source is compromised. Simple averaging degrades with
                  outliers. ASTREA&apos;s stake-weighted median with automatic
                  slashing maintains accuracy even under active attack.
                </p>
              </motion.div>

              <button
                onClick={handleRestart}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                <FiRefreshCw size={14} /> Run Simulation Again
              </button>
            </motion.div>
          ) : (
            /* ---- Active Step ---- */
            <motion.div
              key={`step-${currentStep}`}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {(() => {
                const step = STEPS[currentStep];
                const isStepDone = completed[currentStep];
                const StepIcon = STEP_ICONS[currentStep];

                return (
                  <>
                    <div
                      className={`rounded-xl border-l-4 p-4 ${step.borderClass} ${step.bgClass}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <StepIcon
                              className={step.colorClass}
                              size={16}
                            />
                            <span
                              className={`text-xs font-semibold uppercase tracking-wider ${step.colorClass}`}
                            >
                              Step {currentStep + 1}: {step.title}
                            </span>
                          </div>
                          <p className="text-white font-medium text-sm mb-2">
                            {step.instruction}
                          </p>
                          <p className="text-dark-400 text-xs leading-relaxed">
                            {step.hint}
                          </p>
                        </div>

                        {/* Completion badge or countdown */}
                        {isStepDone && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{
                              type: "spring",
                              stiffness: 300,
                              damping: 20,
                            }}
                            className="ml-4 flex-shrink-0"
                          >
                            {countdown > 0 ? (
                              <CountdownRing
                                seconds={countdown}
                                total={ADVANCE_DELAY}
                                color={step.accentColor}
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                                <FiCheckCircle className="text-green-400 text-xl" />
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>

                      {/* ---- Live Condition Checklist ---- */}
                      {!isStepDone && (
                        <div className="mt-3 pt-3 border-t border-dark-700/30 space-y-1.5">
                          {liveConditions.map((cond, ci) => (
                            <motion.div
                              key={ci}
                              className="flex items-center gap-2 text-xs"
                              animate={
                                cond.met
                                  ? { x: [0, 3, 0] }
                                  : {}
                              }
                              transition={{ duration: 0.3 }}
                            >
                              {cond.met ? (
                                <FiCheckCircle
                                  size={13}
                                  className="text-green-400 flex-shrink-0"
                                />
                              ) : (
                                <FiCircle
                                  size={13}
                                  className="text-dark-500 flex-shrink-0"
                                />
                              )}
                              <span
                                className={
                                  cond.met
                                    ? "text-green-400 font-medium"
                                    : "text-dark-400"
                                }
                              >
                                {cond.label}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {/* ---- Post-step accuracy snapshot ---- */}
                      {isStepDone && snapshots[currentStep] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="mt-3 pt-3 border-t border-dark-700/40"
                        >
                          <p className="text-dark-500 text-[10px] uppercase tracking-wider mb-2">
                            Accuracy snapshot
                          </p>
                          <div className="grid grid-cols-3 gap-3">
                            <AccuracyBar
                              label="Centralized"
                              value={snapshots[currentStep].centralized}
                              color="#f87171"
                              failed={true}
                            />
                            <AccuracyBar
                              label="Average"
                              value={snapshots[currentStep].average}
                              color="#facc15"
                              failed={
                                snapshots[currentStep].average < 99
                              }
                            />
                            <AccuracyBar
                              label="ASTREA"
                              value={snapshots[currentStep].astrea}
                              color="#4ade80"
                              failed={false}
                            />
                          </div>
                          {countdown > 0 && (
                            <p className="text-dark-500 text-xs text-center mt-2">
                              Next step in {countdown}s...
                            </p>
                          )}
                        </motion.div>
                      )}
                    </div>

                    {/* ---- Quick Action Buttons ---- */}
                    {!isStepDone && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mt-4"
                      >
                        <p className="text-dark-500 text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <FiZap size={10} className="text-primary-400" />
                          Quick Actions
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {liveConditions.map((cond, ci) => {
                            // Determine button label and icon
                            let label = "";
                            let icon = FiTarget;
                            if (cond.action === "centralized") {
                              label = "Switch to Centralized";
                              icon = FiShieldOff;
                            } else if (cond.action === "average") {
                              label = "Switch to Simple Average";
                              icon = FiAlertTriangle;
                            } else if (cond.action === "astrea") {
                              label = "Switch to ASTREA";
                              icon = FiShield;
                            } else if (cond.action === "toggle-0") {
                              label = "Make Singapore Malicious";
                              icon = FiTarget;
                            } else if (cond.action === "toggle-any") {
                              label = cond.met
                                ? "Nodes ready"
                                : "Toggle a Node Malicious";
                              icon = FiTarget;
                            }

                            return (
                              <QuickAction
                                key={ci}
                                label={label}
                                icon={icon}
                                done={cond.met}
                                onClick={() =>
                                  handleQuickAction(cond.action)
                                }
                              />
                            );
                          })}
                        </div>
                      </motion.div>
                    )}

                    {/* ---- Live Accuracy Meters ---- */}
                    {!isStepDone && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="mt-4 p-3 bg-dark-800/30 rounded-xl"
                      >
                        <p className="text-dark-500 text-[10px] uppercase tracking-wider mb-2">
                          Live Accuracy
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <AccuracyBar
                            label="Centralized"
                            value={oracleState.accuracy.centralized}
                            color="#f87171"
                            failed={oracleState.accuracy.centralized < 99}
                          />
                          <AccuracyBar
                            label="Average"
                            value={oracleState.accuracy.average}
                            color="#facc15"
                            failed={oracleState.accuracy.average < 99}
                          />
                          <AccuracyBar
                            label="ASTREA"
                            value={oracleState.accuracy.astrea}
                            color="#4ade80"
                            failed={false}
                          />
                        </div>
                      </motion.div>
                    )}

                    {/* Interaction hint */}
                    {!isStepDone && (
                      <motion.p
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{
                          repeat: Infinity,
                          duration: 2,
                          ease: "easeInOut",
                        }}
                        className="text-center text-dark-500 text-xs mt-4 flex items-center justify-center gap-2"
                      >
                        <HiOutlineBolt
                          size={14}
                          className="text-primary-400"
                        />
                        Use quick actions above or the dashboard controls below
                      </motion.p>
                    )}
                  </>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
