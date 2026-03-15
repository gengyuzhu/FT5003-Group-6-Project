import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiHeart, FiClock } from "react-icons/fi";
import { HiOutlineCurrencyDollar } from "react-icons/hi2";
import { truncateAddress, nftGradient } from "@/utils/format";

export default function NFTCard({ nft, index = 0 }) {
  const {
    tokenId,
    name,
    image,
    price,
    seller,
    isAuction,
    endTime,
    highestBid,
  } = nft;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="group"
    >
      <Link to={`/nft/${tokenId}`}>
        <div className="glass-card overflow-hidden transition-all duration-300 group-hover:border-primary-500/50 group-hover:shadow-lg group-hover:shadow-primary-500/10">
          {/* Image */}
          <div className="relative aspect-square overflow-hidden">
            {image ? (
              <img
                src={image}
                alt={name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              <div
                className={`w-full h-full bg-gradient-to-br ${nftGradient(
                  tokenId
                )} flex items-center justify-center`}
              >
                <span className="text-4xl font-bold text-white/30">
                  #{tokenId}
                </span>
              </div>
            )}

            {/* Badges */}
            <div className="absolute top-3 right-3 flex gap-2">
              {isAuction && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-dark-900/80 backdrop-blur-sm text-xs text-primary-300">
                  <FiClock className="w-3 h-3" />
                  Auction
                </span>
              )}
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-dark-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>

          {/* Info */}
          <div className="p-4 space-y-3">
            <h3 className="font-semibold text-white truncate">
              {name || `NFT #${tokenId}`}
            </h3>

            <div className="flex items-center justify-between text-sm">
              <span className="text-dark-400">
                {seller ? truncateAddress(seller) : "Unknown"}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-dark-700/50">
              <div>
                <p className="text-xs text-dark-400">
                  {isAuction ? "Current Bid" : "Price"}
                </p>
                <p className="font-semibold text-white flex items-center gap-1">
                  <HiOutlineCurrencyDollar className="w-4 h-4 text-primary-400" />
                  {isAuction
                    ? highestBid || price || "No bids"
                    : price || "Not listed"}
                  {(price || highestBid) && (
                    <span className="text-dark-400 text-xs">ETH</span>
                  )}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-2 rounded-full hover:bg-dark-700 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                <FiHeart className="w-4 h-4 text-dark-400 hover:text-pink-400" />
              </motion.button>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
