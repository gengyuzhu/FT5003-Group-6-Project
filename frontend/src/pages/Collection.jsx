import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiGrid,
  FiUsers,
  FiTrendingUp,
  FiLayers,
  FiArrowRight,
  FiChevronDown,
} from "react-icons/fi";
import { HiOutlineCube } from "react-icons/hi2";
import Breadcrumb from "@/components/ui/Breadcrumb";
import {
  getCollectionBySlug,
  getNFTsByCollection,
} from "@/data/mockData";

const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4 } },
};

export default function Collection() {
  const { slug } = useParams();
  const collection = getCollectionBySlug(slug);
  const nftsRaw = collection ? getNFTsByCollection(collection.id) : [];
  const [imgErrors, setImgErrors] = useState({});
  const [itemSort, setItemSort] = useState("default");

  const nfts = useMemo(() => {
    if (itemSort === "default") return nftsRaw;
    const getPrice = (n) => parseFloat(n.type === "auction" ? n.currentBid : n.price);
    return [...nftsRaw].sort((a, b) =>
      itemSort === "price-low" ? getPrice(a) - getPrice(b) : getPrice(b) - getPrice(a)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, itemSort]);

  if (!collection) {
    return (
      <motion.div variants={pageVariants} initial="hidden" animate="visible" className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="glass-card max-w-md w-full p-8 text-center space-y-4">
          <div className="text-5xl mb-2">🔍</div>
          <h2 className="text-2xl font-bold gradient-text">Collection Not Found</h2>
          <p className="text-dark-300">The collection you&#39;re looking for doesn&#39;t exist or has been removed.</p>
          <Link to="/explore" className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 mt-2">Explore NFTs</Link>
        </div>
      </motion.div>
    );
  }

  const stats = [
    { label: "Items", value: collection.totalSupply.toLocaleString(), icon: HiOutlineCube },
    { label: "Owners", value: collection.owners.toLocaleString(), icon: FiUsers },
    { label: "Floor Price", value: `${collection.floorPrice} ETH`, icon: FiLayers },
    { label: "Total Volume", value: `${collection.totalVolume} ETH`, icon: FiTrendingUp },
  ];

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-dark-950 py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
    >
      <Breadcrumb
        items={[
          { label: "Home", to: "/" },
          { label: "Explore", to: "/explore" },
          { label: collection.name },
        ]}
      />

      {/* ====== Banner ====== */}
      <div
        className={`h-44 sm:h-56 rounded-2xl bg-gradient-to-r ${collection.bannerGradient} relative overflow-hidden mb-8`}
      >
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-0 flex items-end p-6 sm:p-10">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white drop-shadow-lg">
              {collection.name}
            </h1>
            <p className="text-white/70 mt-2 max-w-2xl text-sm sm:text-base">
              {collection.description}
            </p>
          </div>
        </div>
      </div>

      {/* ====== Stats ====== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="glass-card p-5 text-center flex flex-col items-center gap-2"
          >
            <stat.icon className="text-primary-400 text-xl" />
            <p className="text-white text-xl sm:text-2xl font-bold">
              {stat.value}
            </p>
            <p className="text-dark-400 text-sm">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ====== NFT Grid ====== */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FiGrid className="text-primary-400" /> Items
          <span className="text-dark-400 text-base font-normal">
            ({nfts.length})
          </span>
        </h2>
        <div className="relative">
          <select
            value={itemSort}
            onChange={(e) => setItemSort(e.target.value)}
            className="input-field text-sm py-2 pl-3 pr-8 appearance-none cursor-pointer"
          >
            <option value="default">Default</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
          <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" size={14} />
        </div>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      >
        {nfts.map((nft) => (
          <Link key={nft.id} to={`/nft/${nft.id}`} className="block">
            <motion.div
              variants={cardVariant}
              whileHover={{ y: -6, scale: 1.02 }}
              className="glass-card overflow-hidden group cursor-pointer"
            >
              <div className="h-56 overflow-hidden relative">
                {imgErrors[nft.id] ? (
                  <div
                    className={`h-full w-full bg-gradient-to-br ${nft.gradient} flex items-center justify-center`}
                  >
                    <span className="text-white/40 text-6xl font-extrabold select-none">
                      {nft.name.charAt(0)}
                    </span>
                  </div>
                ) : (
                  <img
                    src={nft.image}
                    alt={nft.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={() =>
                      setImgErrors((prev) => ({ ...prev, [nft.id]: true }))
                    }
                  />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                {/* rarity badge */}
                <span className="absolute top-3 right-3 bg-dark-900/70 backdrop-blur text-dark-300 text-xs px-2 py-0.5 rounded-full">
                  {nft.rarity}
                </span>
              </div>
              <div className="p-4 space-y-2">
                <h3 className="text-white font-semibold truncate">
                  {nft.name}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="gradient-text font-bold text-sm">
                    {nft.type === "auction" ? `${nft.currentBid} ETH` : `${nft.price} ETH`}
                  </span>
                  <span className="text-primary-400 text-sm flex items-center gap-1">
                    View <FiArrowRight size={14} />
                  </span>
                </div>
              </div>
            </motion.div>
          </Link>
        ))}
      </motion.div>
    </motion.div>
  );
}
