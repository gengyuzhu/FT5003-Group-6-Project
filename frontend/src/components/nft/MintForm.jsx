import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { FiUpload, FiImage, FiX } from "react-icons/fi";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";
import { useMintNFT } from "@/hooks/useNFTCollection";
import { useIPFSUpload } from "@/hooks/useIPFS";

export default function MintForm() {
  const { address } = useAccount();
  const { mint, isPending, isConfirming, isSuccess } = useMintNFT();
  const { upload, isUploading } = useIPFSUpload();

  const [form, setForm] = useState({
    name: "",
    description: "",
    royaltyFee: 5,
    category: "Art",
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const handleFileChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(f);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(f);
  }, []);

  const removeFile = () => {
    setFile(null);
    setPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!address) return toast.error("Please connect your wallet");
    if (!file) return toast.error("Please upload an image");
    if (!form.name.trim()) return toast.error("Please enter a name");

    try {
      toast.loading("Uploading to IPFS...", { id: "mint" });
      const tokenURI = await upload({
        file,
        name: form.name,
        description: form.description,
        attributes: [{ trait_type: "Category", value: form.category }],
      });

      toast.loading("Minting NFT...", { id: "mint" });
      const royaltyBps = Math.round(form.royaltyFee * 100);
      await mint(address, tokenURI, royaltyBps);
      toast.success("Mint transaction submitted!", { id: "mint" });
    } catch (err) {
      toast.error("Failed to mint: " + (err.shortMessage || err.message), {
        id: "mint",
      });
    }
  };

  const isLoading = isPending || isConfirming || isUploading;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          Image
        </label>
        {preview ? (
          <div className="relative aspect-square max-w-sm rounded-xl overflow-hidden border border-dark-600">
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={removeFile}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-dark-900/80 hover:bg-red-500/80 transition-colors"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <motion.div
            whileHover={{ borderColor: "rgb(139, 92, 246)" }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="relative aspect-square max-w-sm rounded-xl border-2 border-dashed border-dark-600 flex flex-col items-center justify-center cursor-pointer hover:border-primary-500 transition-colors bg-dark-800/50"
          >
            <FiImage className="w-12 h-12 text-dark-500 mb-3" />
            <p className="text-dark-400 text-sm">
              Drag & drop or click to upload
            </p>
            <p className="text-dark-500 text-xs mt-1">
              PNG, JPG, GIF, SVG. Max 10MB.
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </motion.div>
        )}
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          Name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Enter NFT name"
          className="input-field"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          Description
        </label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe your NFT..."
          rows={4}
          className="input-field resize-none"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          Category
        </label>
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="input-field"
        >
          <option value="Art">Art</option>
          <option value="Photography">Photography</option>
          <option value="Music">Music</option>
          <option value="Collectibles">Collectibles</option>
          <option value="Gaming">Gaming</option>
          <option value="Utility">Utility</option>
        </select>
      </div>

      {/* Royalty Fee */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          Royalty Fee: {form.royaltyFee}%
        </label>
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={form.royaltyFee}
          onChange={(e) =>
            setForm({ ...form, royaltyFee: parseFloat(e.target.value) })
          }
          className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
        />
        <div className="flex justify-between text-xs text-dark-500 mt-1">
          <span>0%</span>
          <span>10%</span>
        </div>
      </div>

      {/* Submit */}
      <motion.button
        type="submit"
        disabled={isLoading || !address}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <FiUpload className="w-5 h-5" />
        )}
        {isUploading
          ? "Uploading..."
          : isPending
          ? "Confirm in Wallet..."
          : isConfirming
          ? "Minting..."
          : "Mint NFT"}
      </motion.button>
    </form>
  );
}
