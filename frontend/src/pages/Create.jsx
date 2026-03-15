import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  FiUploadCloud,
  FiImage,
  FiTag,
  FiPercent,
  FiLayers,
  FiCheckCircle,
  FiEdit3,
  FiSend,
  FiBox,
  FiPlus,
  FiX,
  FiList,
  FiShield,
} from "react-icons/fi";
import { HiOutlinePaintBrush } from "react-icons/hi2";
import Breadcrumb from "@/components/ui/Breadcrumb";

const CATEGORIES = [
  "Art",
  "Photography",
  "Music",
  "Video",
  "Collectible",
  "Gaming",
  "Utility",
  "Other",
];

// animation variants
const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4 },
  }),
};

const MINT_STEPS = [
  { label: "Uploading to IPFS...", icon: FiUploadCloud, range: [0, 30] },
  { label: "Creating metadata...", icon: FiEdit3, range: [30, 50] },
  { label: "Awaiting wallet signature...", icon: FiSend, range: [50, 70] },
  { label: "Confirming on blockchain...", icon: FiBox, range: [70, 100] },
];

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.3 } },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.85, y: 30 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25 } },
  exit: { opacity: 0, scale: 0.9, y: 20, transition: { duration: 0.25 } },
};

export default function Create() {
  const [form, setForm] = useState({
    name: "",
    description: "",
    royalty: 5,
    category: "Art",
  });
  const [traits, setTraits] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [minting, setMinting] = useState(false);
  const [mintStep, setMintStep] = useState(0);
  const [mintProgress, setMintProgress] = useState(0);
  const [mintComplete, setMintComplete] = useState(false);

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const [fileSize, setFileSize] = useState(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit");
      return;
    }
    setFileSize(file.size);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      handleFile(file);
    },
    [handleFile]
  );

  const onFileInput = (e) => handleFile(e.target.files?.[0]);

  const handleMint = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter an NFT name");
      return;
    }
    setMinting(true);
    setMintComplete(false);
    setMintStep(0);
    setMintProgress(0);

    for (let i = 0; i < MINT_STEPS.length; i++) {
      setMintStep(i);
      const [start, end] = MINT_STEPS[i].range;
      setMintProgress(start);
      // animate progress within this step
      const duration = 800 + Math.random() * 700;
      const tick = 30;
      const steps = Math.ceil(duration / tick);
      const increment = (end - start) / steps;
      for (let s = 0; s < steps; s++) {
        await new Promise((r) => setTimeout(r, tick));
        setMintProgress((prev) => Math.min(prev + increment, end));
      }
    }
    setMintProgress(100);
    setMintComplete(true);
    // auto-dismiss after a short pause
    await new Promise((r) => setTimeout(r, 2200));
    setMinting(false);
    setMintComplete(false);
    setMintStep(0);
    setMintProgress(0);
    toast.success("NFT minted successfully!");
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-dark-950 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Create" }]} />

      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white flex items-center gap-3">
          <HiOutlinePaintBrush className="text-primary-400" /> Create NFT
        </h1>
        <p className="text-dark-400 mt-2">
          Upload your artwork and mint it as an NFT on the blockchain
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* ====== LEFT: form (3 cols) ====== */}
        <div className="lg:col-span-3 space-y-6">
          {/* image upload */}
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <label className="text-white font-medium mb-2 block">
              Upload Image
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors duration-200 ${
                dragOver
                  ? "border-primary-400 bg-primary-400/10"
                  : "border-dark-700 hover:border-dark-500 bg-dark-900/50"
              }`}
              onClick={() => document.getElementById("file-input").click()}
            >
              <input
                id="file-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileInput}
              />
              {imagePreview ? (
                <div className="text-center">
                  <img
                    src={imagePreview}
                    alt="preview"
                    className="mx-auto max-h-52 rounded-lg object-cover"
                  />
                  {fileSize && (
                    <p className="text-dark-500 text-xs mt-2">
                      {(fileSize / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <FiUploadCloud className="text-4xl text-dark-400" />
                  <p className="text-dark-300">
                    Drag &amp; drop an image or{" "}
                    <span className="text-primary-400 font-medium">browse</span>
                  </p>
                  <p className="text-dark-500 text-sm">
                    PNG, JPG, GIF, SVG. Max 10MB
                  </p>
                </div>
              )}
            </div>
            <p className="text-dark-500 text-xs mt-2 flex items-center gap-1.5">
              <FiShield size={12} className="text-primary-400/60" />
              Assets will be securely stored on IPFS (InterPlanetary File System)
            </p>
          </motion.div>

          {/* name */}
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
            <label className="text-white font-medium mb-2 flex items-center gap-2">
              <FiTag className="text-primary-400" /> Name
            </label>
            <input
              type="text"
              placeholder="e.g. Cosmic Dreamer #1"
              value={form.name}
              onChange={handleChange("name")}
              className="input-field w-full"
            />
          </motion.div>

          {/* description */}
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
            <label className="text-white font-medium mb-2 flex items-center gap-2">
              <FiImage className="text-primary-400" /> Description
            </label>
            <textarea
              rows={4}
              placeholder="Describe your NFT..."
              value={form.description}
              onChange={handleChange("description")}
              className="input-field w-full resize-none"
            />
          </motion.div>

          {/* royalty slider */}
          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
            <label className="text-white font-medium mb-2 flex items-center gap-2">
              <FiPercent className="text-primary-400" /> Royalty Fee:{" "}
              <span className="gradient-text">{form.royalty}%</span>
            </label>

            {/* Custom premium slider */}
            {(() => {
              const pct = (form.royalty / 10) * 100;
              const ticks = [0, 2.5, 5, 7.5, 10];
              return (
                <div className="relative pt-8 pb-6 select-none">
                  {/* Floating tooltip bubble */}
                  <div
                    className="absolute top-0 pointer-events-none"
                    style={{
                      left: `${pct}%`,
                      transform: "translateX(-50%)",
                      transition: "left 0.15s ease-out",
                    }}
                  >
                    <div
                      style={{
                        background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                        color: "#fff",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: "8px",
                        boxShadow: "0 0 12px rgba(139,92,246,0.5)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {form.royalty}%
                    </div>
                    {/* Tooltip arrow */}
                    <div
                      style={{
                        width: 0,
                        height: 0,
                        margin: "0 auto",
                        borderLeft: "6px solid transparent",
                        borderRight: "6px solid transparent",
                        borderTop: "6px solid #6366f1",
                      }}
                    />
                  </div>

                  {/* Track container */}
                  <div className="relative w-full h-2 rounded-full" style={{ background: "#1e1b3a" }}>
                    {/* Active gradient fill */}
                    <div
                      className="absolute top-0 left-0 h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg, #8b5cf6, #6366f1, #a78bfa)",
                        boxShadow: "0 0 10px rgba(139,92,246,0.45)",
                        transition: "width 0.15s ease-out",
                      }}
                    />

                    {/* Hidden native range input on top for interaction */}
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={form.royalty}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, royalty: parseFloat(e.target.value) }))
                      }
                      className="absolute top-0 left-0 w-full h-full cursor-pointer"
                      style={{
                        opacity: 0,
                        zIndex: 20,
                        margin: 0,
                        WebkitAppearance: "none",
                      }}
                    />

                    {/* Custom thumb */}
                    <div
                      className="absolute top-1/2 pointer-events-none"
                      style={{
                        left: `${pct}%`,
                        transform: "translate(-50%, -50%)",
                        transition: "left 0.15s ease-out",
                        zIndex: 10,
                      }}
                    >
                      <div
                        className="group"
                        style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, #a78bfa, #6366f1)",
                          border: "3px solid #fff",
                          boxShadow:
                            "0 0 14px rgba(139,92,246,0.7), 0 0 30px rgba(99,102,241,0.3)",
                          transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        }}
                      />
                    </div>
                  </div>

                  {/* Tick marks */}
                  <div className="relative w-full mt-3">
                    {ticks.map((tick) => {
                      const tickPct = (tick / 10) * 100;
                      const isActive = form.royalty >= tick;
                      return (
                        <div
                          key={tick}
                          className="absolute flex flex-col items-center"
                          style={{
                            left: `${tickPct}%`,
                            transform: "translateX(-50%)",
                          }}
                        >
                          <div
                            style={{
                              width: "2px",
                              height: "8px",
                              borderRadius: "1px",
                              background: isActive
                                ? "rgba(139,92,246,0.8)"
                                : "rgba(255,255,255,0.15)",
                              transition: "background 0.3s ease",
                            }}
                          />
                          <span
                            className="text-xs mt-1"
                            style={{
                              color: isActive
                                ? "rgba(167,139,250,0.9)"
                                : "rgba(255,255,255,0.3)",
                              fontWeight: isActive ? 600 : 400,
                              fontSize: "0.65rem",
                              transition: "color 0.3s ease, font-weight 0.3s ease",
                            }}
                          >
                            {tick}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Hover / drag thumb animation via inline style tag */}
            <style>{`
              /* Make the invisible range input expand the thumb hit area */
              input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 28px;
                height: 28px;
                cursor: pointer;
              }
              input[type="range"]::-moz-range-thumb {
                width: 28px;
                height: 28px;
                cursor: pointer;
                border: none;
                background: transparent;
              }
            `}</style>
          </motion.div>

          {/* category */}
          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
            <label className="text-white font-medium mb-2 flex items-center gap-2">
              <FiLayers className="text-primary-400" /> Category
            </label>
            <select
              value={form.category}
              onChange={handleChange("category")}
              className="input-field w-full appearance-none cursor-pointer"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </motion.div>

          {/* traits */}
          <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
            <label className="text-white font-medium mb-2 flex items-center gap-2">
              <FiList className="text-primary-400" /> Traits
            </label>
            <p className="text-dark-500 text-xs mb-3">
              Add custom attributes to your NFT metadata (e.g., Background: Blue)
            </p>

            <div className="space-y-2 mb-3">
              {traits.map((trait, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Type (e.g. Background)"
                    value={trait.trait_type}
                    onChange={(e) => {
                      const next = [...traits];
                      next[i] = { ...next[i], trait_type: e.target.value };
                      setTraits(next);
                    }}
                    className="input-field flex-1"
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. Blue)"
                    value={trait.value}
                    onChange={(e) => {
                      const next = [...traits];
                      next[i] = { ...next[i], value: e.target.value };
                      setTraits(next);
                    }}
                    className="input-field flex-1"
                  />
                  <button
                    onClick={() => setTraits((prev) => prev.filter((_, j) => j !== i))}
                    className="text-dark-400 hover:text-red-400 transition-colors p-2"
                  >
                    <FiX size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setTraits((prev) => [...prev, { trait_type: "", value: "" }])}
              className="btn-secondary px-4 py-2 text-sm flex items-center gap-2"
            >
              <FiPlus size={14} /> Add Trait
            </button>
          </motion.div>

          {/* mint button */}
          <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
            <button
              onClick={handleMint}
              disabled={minting}
              className="btn-primary w-full py-3.5 text-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {minting ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Minting...
                </>
              ) : (
                <>
                  <FiCheckCircle /> Mint NFT
                </>
              )}
            </button>
          </motion.div>
        </div>

        {/* ====== RIGHT: preview card (2 cols) ====== */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="lg:col-span-2"
        >
          <p className="text-white font-medium mb-3">Preview</p>
          <div className="glass-card overflow-hidden sticky top-24">
            {/* image */}
            <div className="h-64 bg-gradient-to-br from-primary-600/40 to-purple-600/40 flex items-center justify-center">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="nft preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <FiImage className="text-5xl text-dark-500" />
              )}
            </div>

            <div className="p-5 space-y-3">
              <h3 className="text-white font-semibold text-lg truncate">
                {form.name || "NFT Name"}
              </h3>
              <p className="text-dark-400 text-sm line-clamp-3">
                {form.description || "Your NFT description will appear here."}
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-xs bg-dark-800 text-primary-400 px-2.5 py-1 rounded-full">
                  {form.category}
                </span>
                <span className="text-xs bg-dark-800 text-dark-300 px-2.5 py-1 rounded-full">
                  Royalty: {form.royalty}%
                </span>
              </div>

              {/* traits preview */}
              {traits.filter((t) => t.trait_type && t.value).length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-dark-700/40">
                  {traits
                    .filter((t) => t.trait_type && t.value)
                    .map((t, i) => (
                      <div
                        key={i}
                        className="bg-dark-800/50 rounded-lg p-2 text-center"
                      >
                        <p className="text-primary-400 text-[10px] uppercase tracking-wider">
                          {t.trait_type}
                        </p>
                        <p className="text-white text-xs font-medium mt-0.5">
                          {t.value}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ====== Minting Progress Overlay ====== */}
      <AnimatePresence>
        {minting && (
          <motion.div
            key="mint-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900 p-8 shadow-2xl"
            >
              {/* title */}
              {!mintComplete && (
                <motion.h2
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="text-center text-2xl font-bold text-white mb-6"
                >
                  Minting in Progress
                </motion.h2>
              )}

              {mintComplete ? (
                /* ---- success state ---- */
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 250, damping: 20 }}
                  className="flex flex-col items-center gap-4 py-6"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: [0, 1.2, 1] }}
                    transition={{ duration: 0.6, times: [0, 0.6, 1] }}
                    className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center"
                  >
                    <FiCheckCircle className="text-green-400 text-4xl" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white">Minted Successfully!</h2>
                  <p className="text-dark-400 text-sm text-center">
                    Your NFT has been minted and is now on the blockchain.
                  </p>
                </motion.div>
              ) : (
                /* ---- step progress ---- */
                <>
                  {/* progress bar */}
                  <div className="w-full h-3 rounded-full bg-dark-800 overflow-hidden mb-8">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: "linear-gradient(90deg, #8b5cf6, #6366f1, #3b82f6)",
                      }}
                      animate={{ width: `${mintProgress}%` }}
                      transition={{ duration: 0.15, ease: "linear" }}
                    />
                  </div>

                  {/* steps */}
                  <div className="space-y-4">
                    {MINT_STEPS.map((step, i) => {
                      const StepIcon = step.icon;
                      const isActive = i === mintStep;
                      const isDone = i < mintStep;
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{
                            opacity: isDone || isActive ? 1 : 0.35,
                            x: 0,
                          }}
                          transition={{ duration: 0.3, delay: i * 0.05 }}
                          className="flex items-center gap-3"
                        >
                          {/* icon circle */}
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${
                              isDone
                                ? "bg-green-500/20 text-green-400"
                                : isActive
                                ? "bg-primary-500/20 text-primary-400"
                                : "bg-dark-800 text-dark-500"
                            }`}
                          >
                            {isDone ? (
                              <FiCheckCircle className="text-lg" />
                            ) : (
                              <StepIcon className="text-lg" />
                            )}
                          </div>

                          {/* label */}
                          <span
                            className={`text-sm font-medium transition-colors duration-300 ${
                              isDone
                                ? "text-green-400"
                                : isActive
                                ? "text-white"
                                : "text-dark-500"
                            }`}
                          >
                            {step.label}
                          </span>

                          {/* spinner for active step */}
                          {isActive && (
                            <motion.svg
                              animate={{ rotate: 360 }}
                              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                              className="ml-auto h-4 w-4 text-primary-400"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12" cy="12" r="10"
                                stroke="currentColor" strokeWidth="4" fill="none"
                              />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                              />
                            </motion.svg>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* percentage text */}
                  <p className="text-center text-dark-400 text-sm mt-6">
                    {Math.round(mintProgress)}% complete
                  </p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
