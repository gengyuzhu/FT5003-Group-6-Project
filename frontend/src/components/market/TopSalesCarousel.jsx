import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { HiOutlineBolt } from "react-icons/hi2";
import { MOCK_GLOBAL_ACTIVITY, getNFTById } from "@/data/mockData";

export default function TopSalesCarousel() {
  const [page, setPage] = useState(0);

  const topSales = useMemo(() => {
    return MOCK_GLOBAL_ACTIVITY
      .filter((e) => e.event === "Sale")
      .map((e) => {
        const nft = getNFTById(e.nftId);
        return {
          ...e,
          image: nft?.image,
          gradient: nft?.gradient || "from-primary-500 to-purple-500",
          collection: nft?.collectionSlug,
        };
      })
      .sort(
        (a, b) =>
          parseFloat(b.price.replace(" ETH", "")) -
          parseFloat(a.price.replace(" ETH", ""))
      );
  }, []);

  const perPage = 4;
  const totalPages = Math.ceil(topSales.length / perPage);
  const visible = topSales.slice(page * perPage, (page + 1) * perPage);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <HiOutlineBolt className="text-primary-400" /> Top Sales
        </h3>
        {totalPages > 1 && (
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 glass-card rounded-lg hover:bg-dark-700 disabled:opacity-30 transition-all"
            >
              <FiChevronLeft size={14} className="text-white" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1.5 glass-card rounded-lg hover:bg-dark-700 disabled:opacity-30 transition-all"
            >
              <FiChevronRight size={14} className="text-white" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <AnimatePresence mode="wait">
          {visible.map((sale, i) => (
            <motion.div
              key={`${sale.id}-${page}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link
                to={`/nft/${sale.nftId}`}
                className="glass-card overflow-hidden group cursor-pointer block hover:border-primary-500/30 transition-all duration-300"
              >
                <div className="h-32 overflow-hidden relative">
                  {sale.image ? (
                    <img
                      src={sale.image}
                      alt={sale.nft}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <div
                      className={`w-full h-full bg-gradient-to-br ${sale.gradient} flex items-center justify-center`}
                    >
                      <span className="text-white/30 text-4xl font-bold">
                        {sale.nft.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-white text-xs font-semibold truncate">
                      {sale.nft}
                    </p>
                  </div>
                </div>
                <div className="p-3">
                  <p className="gradient-text font-bold text-sm">
                    {sale.price}
                  </p>
                  <p className="text-dark-500 text-xs mt-0.5">{sale.time}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
