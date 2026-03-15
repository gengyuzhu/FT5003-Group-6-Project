import { useState } from "react";
import { motion } from "framer-motion";
import { FiZap } from "react-icons/fi";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";
import { usePlaceBid } from "@/hooks/useMarketplace";

export default function PlaceBidForm({ auctionId, minBid, seller }) {
  const { address } = useAccount();
  const { bid, isPending, isConfirming } = usePlaceBid();
  const [amount, setAmount] = useState("");

  const handleBid = (e) => {
    e.preventDefault();
    if (!address) return toast.error("Please connect your wallet");
    if (address.toLowerCase() === seller?.toLowerCase()) {
      return toast.error("You cannot bid on your own auction");
    }
    if (!amount || parseFloat(amount) <= 0) {
      return toast.error("Enter a valid bid amount");
    }
    if (parseFloat(amount) <= parseFloat(minBid || 0)) {
      return toast.error(`Bid must be higher than ${minBid} ETH`);
    }

    try {
      bid(auctionId, amount);
      toast.success("Bid transaction submitted!");
    } catch (err) {
      toast.error("Failed: " + (err.shortMessage || err.message));
    }
  };

  const isLoading = isPending || isConfirming;

  return (
    <form onSubmit={handleBid} className="space-y-3">
      <div className="relative">
        <input
          type="number"
          step="0.001"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Min: ${minBid || "0"} ETH`}
          className="input-field pr-16"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400 text-sm">
          ETH
        </span>
      </div>
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
          <FiZap className="w-5 h-5" />
        )}
        {isPending ? "Confirm in Wallet..." : isConfirming ? "Processing..." : "Place Bid"}
      </motion.button>
    </form>
  );
}
