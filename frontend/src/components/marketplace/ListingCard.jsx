import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { HiOutlineCurrencyDollar } from "react-icons/hi2";
import { truncateAddress, nftGradient } from "@/utils/format";

export default function ListingCard({ listing, index = 0 }) {
  const { listingId, tokenId, name, image, price, seller } = listing;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -6 }}
      className="group"
    >
      <Link to={`/nft/${tokenId}?listing=${listingId}`}>
        <div className="glass-card overflow-hidden transition-all duration-300 group-hover:border-primary-500/50 group-hover:shadow-lg group-hover:shadow-primary-500/10">
          <div className="relative aspect-square overflow-hidden">
            {image ? (
              <img
                src={image}
                alt={name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              <div
                className={`w-full h-full bg-gradient-to-br ${nftGradient(tokenId)} flex items-center justify-center`}
              >
                <span className="text-4xl font-bold text-white/30">#{tokenId}</span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-dark-900/90 to-transparent">
              <span className="text-xs text-dark-300">
                Seller: {truncateAddress(seller)}
              </span>
            </div>
          </div>

          <div className="p-4">
            <h3 className="font-semibold text-white truncate mb-2">
              {name || `NFT #${tokenId}`}
            </h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <HiOutlineCurrencyDollar className="w-5 h-5 text-primary-400" />
                <span className="font-bold text-white">{price}</span>
                <span className="text-dark-400 text-sm">ETH</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                Buy
              </motion.button>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
