import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import {
  FiSearch,
  FiFilter,
  FiChevronDown,
  FiShoppingCart,
  FiClock,
  FiX,
  FiWifi,
} from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";
import { ALL_NFTS } from "@/data/mockData";
import { useAllListings, useAllAuctions } from "@/hooks/useListings";
import Breadcrumb from "@/components/ui/Breadcrumb";

// Map mockData to explore format — convert ISO endTime to unix timestamp
const MOCK_LISTINGS = ALL_NFTS.map((nft) => ({
  ...nft,
  endTime: nft.endTime ? Math.floor(new Date(nft.endTime).getTime() / 1000) : null,
}));

const CATEGORIES = ["Art", "Photography", "Music", "Video", "Collectible", "Gaming", "Utility", "Other"];

const IMAGE_HEIGHTS = [
  "h-44", "h-56", "h-64", "h-48", "h-60", "h-52",
  "h-56", "h-44", "h-64", "h-48", "h-56", "h-60",
  "h-44", "h-52", "h-64",
];

// ---- animation variants ----
const pageVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4 } },
};

const sidebarVariants = {
  hidden: { x: "-100%", opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: "spring", damping: 25, stiffness: 250 } },
  exit: { x: "-100%", opacity: 0, transition: { duration: 0.25 } },
};

const collapseVariants = {
  open: { height: "auto", opacity: 1, transition: { duration: 0.3, ease: "easeInOut" } },
  closed: { height: 0, opacity: 0, transition: { duration: 0.25, ease: "easeInOut" } },
};

// ---- countdown hook ----
function useCountdown(endTimestamp) {
  const [remaining, setRemaining] = useState(() => {
    if (!endTimestamp) return null;
    return Math.max(0, endTimestamp - Math.floor(Date.now() / 1000));
  });

  useEffect(() => {
    if (!endTimestamp) return;
    const tick = () => {
      const diff = Math.max(0, endTimestamp - Math.floor(Date.now() / 1000));
      setRemaining(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTimestamp]);

  if (remaining === null || remaining <= 0) return "00:00:00";
  const h = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const m = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const s = String(remaining % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ---- lazy image component ----
function LazyImage({ className, gradient, letter, imageSrc }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className} relative overflow-hidden`}>
      {visible ? (
        imageSrc && !imgError ? (
          <img
            src={imageSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <span className="text-white/40 text-7xl font-extrabold select-none">{letter}</span>
          </div>
        )
      ) : (
        <div className="absolute inset-0 bg-dark-800 animate-pulse" />
      )}
    </div>
  );
}

// ---- collapsible filter section ----
function FilterSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-dark-700/50 pb-3 mb-3">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center justify-between w-full text-sm font-semibold text-white py-2 hover:text-primary-400 transition-colors"
      >
        {title}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <FiChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            variants={collapseVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="overflow-hidden"
          >
            <div className="pt-1 pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- skeleton loader ----
function SkeletonCard() {
  return (
    <div className="glass-card overflow-hidden animate-pulse break-inside-avoid mb-5">
      <div className="h-56 bg-dark-800" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-dark-800 rounded w-3/4" />
        <div className="h-3 bg-dark-800 rounded w-1/2" />
        <div className="flex justify-between items-center pt-1">
          <div className="h-5 bg-dark-800 rounded w-20" />
          <div className="h-8 bg-dark-800 rounded w-16" />
        </div>
      </div>
    </div>
  );
}

// ---- NFT Card ----
function NftCard({ nft, heightClass }) {
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const countdown = useCountdown(nft.endTime);

  const handleMouseMove = useCallback((e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 10;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -10;
    setTilt({ x, y });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    setTilt({ x: 0, y: 0 });
  }, []);

  return (
    <Link to={`/nft/${nft.id}`} className="block break-inside-avoid mb-5">
      <motion.div
        ref={cardRef}
        variants={cardVariant}
        onMouseEnter={() => setHovered(true)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="glass-card overflow-hidden cursor-pointer transition-shadow duration-300"
        style={{
          boxShadow: hovered
            ? "0 0 20px 2px rgba(139, 92, 246, 0.35), 0 0 40px 4px rgba(139, 92, 246, 0.15)"
            : "none",
        }}
      >
        {/* image area with parallax tilt */}
        <motion.div
          animate={{ rotateX: tilt.y, rotateY: tilt.x }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          style={{ perspective: 800, transformStyle: "preserve-3d" }}
          className="relative"
        >
          <LazyImage
            className={heightClass}
            gradient={nft.gradient}
            letter={nft.name.charAt(0)}
            imageSrc={nft.image}
          />

          {/* auction badge with countdown */}
          {nft.type === "auction" && (
            <span className="absolute top-3 right-3 bg-dark-900/80 backdrop-blur text-primary-400 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 z-10">
              <FiClock size={12} /> {countdown}
            </span>
          )}

          {/* category badge */}
          <span className="absolute top-3 left-3 bg-dark-900/70 backdrop-blur text-dark-300 text-xs font-medium px-2 py-0.5 rounded-full z-10">
            {nft.category}
          </span>

          {/* hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />

          {/* buy/bid overlay label sliding up */}
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent z-10"
              >
                <span className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2">
                  {nft.type === "auction" ? (
                    <>Place Bid <FiClock size={14} /></>
                  ) : (
                    <>Buy Now <FiShoppingCart size={14} /></>
                  )}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* info */}
        <div className="p-4 space-y-2">
          <h3 className="text-white font-semibold text-lg truncate">{nft.name}</h3>
          <div className="flex items-center justify-between">
            <p className="text-dark-400 text-sm truncate">
              {nft.seller}
            </p>
            <span className="text-xs text-dark-500">{nft.rarity}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-dark-700/40">
            <div>
              {nft.type === "auction" ? (
                <>
                  <p className="text-xs text-dark-400">Current Bid</p>
                  <p className="gradient-text font-bold">{nft.currentBid} ETH</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-dark-400">Price</p>
                  <p className="gradient-text font-bold">{nft.price} ETH</p>
                </>
              )}
            </div>
            <p className="text-xs text-dark-500">{nft.time}</p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ---- sidebar content ----
function SidebarContent({ types, setTypes, minPrice, setMinPrice, maxPrice, setMaxPrice, categories, setCategories, sort, setSort, onClear }) {
  const toggleType = (t) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const toggleCat = (c) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FiFilter size={18} /> Filters
        </h2>
        <button onClick={onClear} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
          Clear All
        </button>
      </div>

      {/* Type filter */}
      <FilterSection title="Type">
        {["fixed", "auction"].map((t) => (
          <label key={t} className="flex items-center gap-2 py-1.5 text-sm text-dark-300 hover:text-white cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={types.includes(t)}
              onChange={() => toggleType(t)}
              className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
            />
            {t === "fixed" ? "Fixed Price" : "Auction"}
          </label>
        ))}
      </FilterSection>

      {/* Price range */}
      <FilterSection title="Price Range (ETH)">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Min"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              className="input-field w-full text-sm py-2 pr-10"
              step="0.01"
              min="0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 text-xs">ETH</span>
          </div>
          <span className="text-dark-500 text-sm">-</span>
          <div className="relative flex-1">
            <input
              type="number"
              placeholder="Max"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="input-field w-full text-sm py-2 pr-10"
              step="0.01"
              min="0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 text-xs">ETH</span>
          </div>
        </div>
      </FilterSection>

      {/* Category */}
      <FilterSection title="Category">
        {CATEGORIES.map((c) => (
          <label key={c} className="flex items-center gap-2 py-1.5 text-sm text-dark-300 hover:text-white cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={categories.includes(c)}
              onChange={() => toggleCat(c)}
              className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
            />
            {c}
          </label>
        ))}
      </FilterSection>

      {/* Sort */}
      <FilterSection title="Sort By">
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="input-field w-full text-sm py-2 pr-8 appearance-none cursor-pointer"
          >
            <option value="recent">Most Recent</option>
            <option value="low">Price: Low to High</option>
            <option value="high">Price: High to Low</option>
          </select>
          <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none" size={14} />
        </div>
      </FilterSection>
    </div>
  );
}

// ---- main component ----
export default function Explore() {
  const { isConnected } = useAccount();
  const { listings: onChainListings, isLoading: listingsLoading } = useAllListings();
  const { auctions: onChainAuctions, isLoading: auctionsLoading } = useAllAuctions();
  const isLive = isConnected && !listingsLoading && !auctionsLoading;

  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery);
  const [types, setTypes] = useState([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [categories, setCategories] = useState([]);
  const [sort, setSort] = useState("recent");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const debounceRef = useRef(null);

  // Debounce search input by 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const clearFilters = useCallback(() => {
    setTypes([]);
    setMinPrice("");
    setMaxPrice("");
    setCategories([]);
    setSort("recent");
    setSearchInput("");
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (types.length) count++;
    if (minPrice || maxPrice) count++;
    if (categories.length) count++;
    if (sort !== "recent") count++;
    return count;
  }, [types, minPrice, maxPrice, categories, sort]);

  // Deterministic gradient based on tokenId
  const GRADIENTS = [
    "from-violet-500 to-fuchsia-500",
    "from-cyan-500 to-blue-500",
    "from-emerald-500 to-teal-500",
    "from-orange-500 to-red-500",
    "from-pink-500 to-rose-500",
    "from-indigo-500 to-purple-500",
    "from-amber-500 to-yellow-500",
  ];

  // Convert on-chain listings to display format — merges with mock when available
  const liveListings = useMemo(() => {
    const items = [];
    for (const l of onChainListings) {
      const grad = GRADIENTS[l.tokenId % GRADIENTS.length];
      items.push({
        id: `listing-${l.listingId}`,
        listingId: l.listingId,
        name: `NFT #${l.tokenId}`,
        seller: `${l.seller.slice(0, 6)}...${l.seller.slice(-4)}`,
        price: parseFloat(formatEther(l.price)).toFixed(4),
        type: "fixed",
        category: "Art",
        gradient: grad,
        image: "",
        rarity: "",
        time: l.expiration > 0 ? `Expires ${new Date(l.expiration * 1000).toLocaleDateString()}` : "No expiry",
      });
    }
    for (const a of onChainAuctions) {
      const grad = GRADIENTS[a.tokenId % GRADIENTS.length];
      items.push({
        id: `auction-${a.auctionId}`,
        auctionId: a.auctionId,
        name: `NFT #${a.tokenId}`,
        seller: `${a.seller.slice(0, 6)}...${a.seller.slice(-4)}`,
        currentBid: parseFloat(formatEther(a.highestBid)).toFixed(4),
        price: parseFloat(formatEther(a.startPrice)).toFixed(4),
        type: "auction",
        endTime: a.endTime,
        category: "Art",
        gradient: grad,
        image: "",
        rarity: "",
        time: "",
      });
    }
    // When connected but no on-chain data exists yet, still show mock data as demo
    if (items.length === 0 && isConnected) {
      return MOCK_LISTINGS;
    }
    return items;
  }, [onChainListings, onChainAuctions, isConnected]);

  const filtered = useMemo(() => {
    let list = isLive ? [...liveListings] : [...MOCK_LISTINGS];

    // search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.category.toLowerCase().includes(q) ||
          n.seller.toLowerCase().includes(q)
      );
    }

    // type filter
    if (types.length > 0) {
      list = list.filter((n) => types.includes(n.type));
    }

    // price range (use currentBid for auctions, price for fixed)
    if (minPrice) {
      list = list.filter((n) => {
        const p = parseFloat(n.type === "auction" ? n.currentBid : n.price);
        return p >= parseFloat(minPrice);
      });
    }
    if (maxPrice) {
      list = list.filter((n) => {
        const p = parseFloat(n.type === "auction" ? n.currentBid : n.price);
        return p <= parseFloat(maxPrice);
      });
    }

    // category filter
    if (categories.length > 0) {
      list = list.filter((n) => categories.includes(n.category));
    }

    // sort (use currentBid for auctions, price for fixed — consistent with filter)
    const getPrice = (n) => parseFloat(n.type === "auction" ? n.currentBid : n.price);
    if (sort === "low") list.sort((a, b) => getPrice(a) - getPrice(b));
    if (sort === "high") list.sort((a, b) => getPrice(b) - getPrice(a));

    return list;
  }, [search, types, minPrice, maxPrice, categories, sort, isLive, liveListings]);

  const sidebarProps = {
    types, setTypes,
    minPrice, setMinPrice,
    maxPrice, setMaxPrice,
    categories, setCategories,
    sort, setSort,
    onClear: clearFilters,
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="min-h-screen bg-dark-950 py-12 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto"
    >
      <Breadcrumb items={[{ label: "Home", to: "/" }, { label: "Explore" }]} />

      {/* header */}
      <div className="mb-10">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl sm:text-4xl font-extrabold text-white flex items-center gap-3"
        >
          <HiOutlineSparkles className="text-primary-400" /> Explore NFTs
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-dark-400 mt-2 flex items-center gap-2"
        >
          Browse the latest listings and live auctions
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
            isLive
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
          }`}>
            <FiWifi size={10} />
            {isLive ? "Live Data" : "Demo Data"}
          </span>
        </motion.p>
      </div>

      <div className="flex gap-8">
        {/* ===== desktop sidebar ===== */}
        <motion.aside
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="hidden lg:block w-[280px] flex-shrink-0"
        >
          <div className="glass-card p-5 sticky top-24">
            <SidebarContent {...sidebarProps} />
          </div>
        </motion.aside>

        {/* ===== mobile sidebar drawer ===== */}
        <AnimatePresence>
          {mobileSidebar && (
            <>
              {/* backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileSidebar(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              />
              {/* drawer */}
              <motion.div
                variants={sidebarVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="fixed top-0 left-0 bottom-0 w-[300px] bg-dark-900 border-r border-dark-700/50 z-50 lg:hidden overflow-y-auto"
              >
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white">Filters</h2>
                    <button
                      onClick={() => setMobileSidebar(false)}
                      className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                    >
                      <FiX size={20} />
                    </button>
                  </div>
                  <SidebarContent {...sidebarProps} />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ===== main content ===== */}
        <div className="flex-1 min-w-0">
          {/* search bar + mobile filter toggle */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex gap-3 mb-8"
          >
            <div className="relative flex-1">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-400" />
              <input
                type="text"
                placeholder="Search NFTs by name, category, or seller..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="input-field w-full pl-11"
              />
            </div>

            {/* mobile filter button */}
            <button
              onClick={() => setMobileSidebar(true)}
              className="lg:hidden btn-primary px-4 py-2 flex items-center gap-2 relative"
            >
              <FiFilter size={16} />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-pink-500 text-white text-xs flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </motion.div>

          {/* results count */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-between mb-5"
          >
            <p className="text-dark-400 text-sm">
              {filtered.length} {filtered.length === 1 ? "item" : "items"} found
            </p>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-primary-400 hover:text-primary-300 transition-colors lg:hidden"
              >
                Clear All Filters
              </button>
            )}
          </motion.div>

          {/* masonry grid */}
          {isConnected && (listingsLoading || auctionsLoading) && (
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-5 mb-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={types.join(",") + categories.join(",") + sort + search + minPrice + maxPrice}
              variants={stagger}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="columns-1 sm:columns-2 lg:columns-3 gap-5"
            >
              {filtered.length === 0 ? (
                <motion.div
                  variants={cardVariant}
                  className="col-span-full flex flex-col items-center justify-center py-20"
                >
                  <div className="w-20 h-20 rounded-2xl bg-dark-800/60 flex items-center justify-center mb-5">
                    <FiSearch className="text-dark-500 text-3xl" />
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-2">No NFTs Found</h3>
                  <p className="text-dark-400 text-sm text-center max-w-sm mb-6">
                    Try adjusting your search or filters to discover more items.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={clearFilters}
                      className="btn-secondary px-5 py-2 text-sm"
                    >
                      Clear All Filters
                    </button>
                    <Link to="/create" className="btn-primary px-5 py-2 text-sm">
                      Create an NFT
                    </Link>
                  </div>
                </motion.div>
              ) : (
                filtered.map((nft, idx) => (
                  <NftCard
                    key={nft.id}
                    nft={nft}
                    heightClass={IMAGE_HEIGHTS[idx % IMAGE_HEIGHTS.length]}
                  />
                ))
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
