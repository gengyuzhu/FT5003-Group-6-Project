import { useAccount, useChainId } from "wagmi";

const NETWORKS = {
  11155111: { name: "Sepolia Testnet", color: "bg-green-400" },
  31337: { name: "Hardhat Local", color: "bg-green-400" },
  1: { name: "Ethereum Mainnet", color: "bg-green-400" },
};

export default function NetworkBadge() {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  if (!isConnected) return null;

  const network = NETWORKS[chainId];
  const isSupported = !!network;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-dark-800/60 border border-dark-700/50">
      {/* pulsing dot */}
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
            isSupported ? "bg-green-400" : "bg-red-400"
          }`}
        />
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
            isSupported ? "bg-green-400" : "bg-red-400"
          }`}
        />
      </span>
      <span
        className={`text-xs font-medium whitespace-nowrap ${
          isSupported ? "text-green-400" : "text-red-400"
        }`}
      >
        {isSupported ? network.name : "Wrong Network"}
      </span>
    </div>
  );
}
