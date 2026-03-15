import { formatEther, parseEther } from "viem";

/**
 * Truncate an Ethereum address: 0x1234...abcd
 */
export function truncateAddress(address, chars = 4) {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format wei to ETH string with fixed decimals.
 */
export function formatETH(wei, decimals = 4) {
  if (!wei) return "0";
  const eth = formatEther(wei);
  const num = parseFloat(eth);
  return num.toFixed(decimals).replace(/\.?0+$/, "");
}

/**
 * Parse ETH string to wei (bigint).
 */
export function toWei(eth) {
  return parseEther(eth.toString());
}

/**
 * Relative time string: "2 hours ago", "3 days ago", etc.
 */
export function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp * 1000) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Generate a deterministic gradient for an NFT placeholder based on tokenId.
 */
export function nftGradient(tokenId) {
  const gradients = [
    "from-purple-500 to-pink-500",
    "from-blue-500 to-cyan-500",
    "from-green-500 to-emerald-500",
    "from-orange-500 to-red-500",
    "from-indigo-500 to-purple-500",
    "from-pink-500 to-rose-500",
    "from-teal-500 to-blue-500",
    "from-yellow-500 to-orange-500",
    "from-cyan-500 to-indigo-500",
  ];
  return gradients[Number(tokenId) % gradients.length];
}

/**
 * Format a number with commas: 1234567 → "1,234,567"
 */
export function formatNumber(n) {
  return Number(n).toLocaleString();
}
