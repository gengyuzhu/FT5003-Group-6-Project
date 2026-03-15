import { motion } from "framer-motion";
import NFTCard from "./NFTCard";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

export default function NFTGrid({ nfts = [], emptyMessage = "No NFTs found" }) {
  if (nfts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 text-dark-400"
      >
        <div className="w-20 h-20 rounded-full bg-dark-800 flex items-center justify-center mb-4">
          <span className="text-3xl">🖼️</span>
        </div>
        <p className="text-lg">{emptyMessage}</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    >
      {nfts.map((nft, index) => (
        <NFTCard key={nft.tokenId} nft={nft} index={index} />
      ))}
    </motion.div>
  );
}
