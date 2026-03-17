import { motion } from "framer-motion";
import { FiShoppingCart } from "react-icons/fi";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";
import { useBuyNFT } from "@/hooks/useMarketplace";

export default function BuyButton({ listingId, price, seller }) {
  const { address } = useAccount();
  const { buy, isPending, isConfirming } = useBuyNFT();

  const handleBuy = async () => {
    if (!address) return toast.error("Please connect your wallet");
    if (address.toLowerCase() === seller?.toLowerCase()) {
      return toast.error("You cannot buy your own NFT");
    }

    try {
      await buy(listingId, price);
      toast.success("Purchase transaction submitted!");
    } catch (err) {
      toast.error("Failed: " + (err.shortMessage || err.message));
    }
  };

  const isLoading = isPending || isConfirming;

  return (
    <motion.button
      onClick={handleBuy}
      disabled={isLoading || !address}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="btn-primary w-full flex items-center justify-center gap-2"
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <FiShoppingCart className="w-5 h-5" />
      )}
      {isPending ? "Confirm in Wallet..." : isConfirming ? "Processing..." : "Buy Now"}
    </motion.button>
  );
}
