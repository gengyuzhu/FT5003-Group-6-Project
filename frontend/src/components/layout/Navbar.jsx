import { useState, useEffect, useRef } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useDisconnect, useSwitchChain, useAccount } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import NetworkBadge from "@/components/ui/NetworkBadge";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiMenu,
  FiX,
  FiHome,
  FiCompass,
  FiPlusCircle,
  FiActivity,
  FiBarChart2,
  FiUser,
  FiSearch,
  FiLogOut,
  FiChevronDown,
} from "react-icons/fi";

const navLinks = [
  { to: "/", label: "Home", icon: FiHome },
  { to: "/explore", label: "Explore", icon: FiCompass },
  { to: "/create", label: "Create", icon: FiPlusCircle },
  { to: "/activity", label: "Activity", icon: FiActivity },
  { to: "/market", label: "Market", icon: FiBarChart2 },
];

const SUPPORTED_CHAINS = [hardhat, sepolia];

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/explore?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  // Close user menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Detect scroll for navbar background
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-dark-950/90 backdrop-blur-xl border-b border-dark-800/50 shadow-lg shadow-dark-950/50"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="relative w-9 h-9 rounded-lg gradient-bg flex items-center justify-center shadow-lg shadow-primary-500/25 group-hover:shadow-primary-500/40 transition-shadow duration-300">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <span className="text-xl font-bold gradient-text tracking-tight">
              NFT
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className="relative group"
              >
                {({ isActive }) => (
                  <div
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? "text-primary-400"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>

                    {/* Active gradient underline */}
                    {isActive && (
                      <motion.div
                        layoutId="navbar-underline"
                        className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full gradient-bg"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 30,
                        }}
                      />
                    )}

                    {/* Hover glow */}
                    <div
                      className={`absolute inset-0 rounded-lg transition-opacity duration-200 ${
                        isActive
                          ? "bg-primary-500/10 opacity-100"
                          : "bg-white/5 opacity-0 group-hover:opacity-100"
                      }`}
                    />
                  </div>
                )}
              </NavLink>
            ))}
          </div>

          {/* Desktop Search */}
          <div className="hidden md:flex items-center">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search NFTs..."
                aria-label="Search NFTs"
                className="w-44 focus:w-64 transition-all duration-300 pl-9 pr-3 py-1.5 rounded-lg bg-dark-800/50 border border-dark-700/50 text-sm text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20"
              />
            </div>
          </div>

          {/* Right side: Profile + Connect + User Menu */}
          <div className="hidden md:flex items-center gap-3">
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `p-2 rounded-lg transition-all duration-200 ${
                  isActive
                    ? "text-primary-400 bg-primary-500/10"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              <FiUser className="w-5 h-5" />
            </NavLink>
            <NetworkBadge />
            {isConnected ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen((p) => !p)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-500/10 border border-primary-500/30 hover:bg-primary-500/20 transition-all duration-200"
                >
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-400 to-purple-500" />
                  <span className="text-sm text-white font-mono">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                  <FiChevronDown
                    className={`w-3.5 h-3.5 text-dark-400 transition-transform duration-200 ${
                      userMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-dark-700 bg-dark-900 shadow-2xl shadow-dark-950/80 overflow-hidden z-50"
                    >
                      {/* Switch Network */}
                      <div className="px-3 py-2 border-b border-dark-800">
                        <p className="text-dark-500 text-[10px] uppercase tracking-wider mb-1.5">Switch Network</p>
                        <div className="space-y-1">
                          {SUPPORTED_CHAINS.map((chain) => (
                            <button
                              key={chain.id}
                              onClick={() => {
                                switchChain({ chainId: chain.id });
                                setUserMenuOpen(false);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-800 transition-colors"
                            >
                              <span className="w-2 h-2 rounded-full bg-green-400" />
                              {chain.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Disconnect */}
                      <div className="px-3 py-2">
                        <button
                          onClick={() => {
                            disconnect();
                            setUserMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <FiLogOut className="w-4 h-4" />
                          Disconnect
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <ConnectButton
                chainStatus="icon"
                showBalance={false}
                accountStatus="avatar"
              />
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <FiX className="w-6 h-6" />
            ) : (
              <FiMenu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="md:hidden overflow-hidden bg-dark-950/95 backdrop-blur-xl border-b border-dark-800/50"
          >
            <div className="px-4 py-4 space-y-1">
              <div className="relative mb-3">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search NFTs..."
                  aria-label="Search NFTs"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-dark-800/50 border border-dark-700/50 text-sm text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50"
                />
              </div>
              {navLinks.map(({ to, label, icon: Icon }, index) => (
                <motion.div
                  key={to}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <NavLink
                    to={to}
                    end={to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "text-primary-400 bg-primary-500/10 border-l-2 border-primary-400"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      }`
                    }
                  >
                    <Icon className="w-5 h-5" />
                    <span>{label}</span>
                  </NavLink>
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: navLinks.length * 0.05 }}
              >
                <NavLink
                  to="/profile"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "text-primary-400 bg-primary-500/10 border-l-2 border-primary-400"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`
                  }
                >
                  <FiUser className="w-5 h-5" />
                  <span>Profile</span>
                </NavLink>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (navLinks.length + 1) * 0.05 }}
                className="pt-3 border-t border-dark-800/50 space-y-2"
              >
                <NetworkBadge />
                {isConnected ? (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2 text-sm text-dark-300">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-400 to-purple-500" />
                      <span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                    </div>
                    <div className="px-4 space-y-1">
                      <p className="text-dark-500 text-[10px] uppercase tracking-wider">Switch Network</p>
                      {SUPPORTED_CHAINS.map((chain) => (
                        <button
                          key={chain.id}
                          onClick={() => switchChain({ chainId: chain.id })}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-dark-300 hover:text-white hover:bg-dark-800 transition-colors"
                        >
                          <span className="w-2 h-2 rounded-full bg-green-400" />
                          {chain.name}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => { disconnect(); setMobileOpen(false); }}
                      className="w-full flex items-center gap-2 px-6 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors rounded-lg"
                    >
                      <FiLogOut className="w-4 h-4" />
                      Disconnect
                    </button>
                  </>
                ) : (
                  <ConnectButton
                    chainStatus="icon"
                    showBalance={false}
                    accountStatus="full"
                  />
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

export default Navbar;
