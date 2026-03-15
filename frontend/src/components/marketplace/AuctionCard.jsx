import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiClock } from "react-icons/fi";
import { HiOutlineCurrencyDollar } from "react-icons/hi2";
import { truncateAddress, nftGradient } from "@/utils/format";

function useCountdown(endTime) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = endTime - now;
      if (diff <= 0) {
        setTimeLeft("Ended");
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setTimeLeft(
        `${h.toString().padStart(2, "0")}:${m
          .toString()
          .padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  return timeLeft;
}

export default function AuctionCard({ auction, index = 0 }) {
  const {
    auctionId,
    tokenId,
    name,
    image,
    startPrice,
    highestBid,
    highestBidder,
    endTime,
    seller,
  } = auction;

  const countdown = useCountdown(endTime);
  const isEnded = countdown === "Ended";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ y: -6 }}
      className="group"
    >
      <Link to={`/nft/${tokenId}?auction=${auctionId}`}>
        <div className="glass-card overflow-hidden transition-all duration-300 group-hover:border-primary-500/50">
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

            {/* Countdown badge */}
            <div className="absolute top-3 left-3">
              <span
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full backdrop-blur-sm text-xs font-mono font-bold ${
                  isEnded
                    ? "bg-red-500/80 text-white"
                    : "bg-dark-900/80 text-primary-300"
                }`}
              >
                <FiClock className="w-3 h-3" />
                {countdown}
              </span>
            </div>
          </div>

          <div className="p-4 space-y-2">
            <h3 className="font-semibold text-white truncate">
              {name || `NFT #${tokenId}`}
            </h3>
            <p className="text-xs text-dark-400">
              by {truncateAddress(seller)}
            </p>
            <div className="flex items-center justify-between pt-2 border-t border-dark-700/50">
              <div>
                <p className="text-xs text-dark-400">
                  {highestBid ? "Highest Bid" : "Starting Price"}
                </p>
                <p className="font-semibold flex items-center gap-1">
                  <HiOutlineCurrencyDollar className="w-4 h-4 text-primary-400" />
                  {highestBid || startPrice}
                  <span className="text-dark-400 text-xs">ETH</span>
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-4 py-1.5 rounded-lg bg-primary-600/20 text-primary-300 text-sm font-medium border border-primary-500/30 hover:bg-primary-600/40 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                {isEnded ? "View" : "Bid"}
              </motion.button>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
