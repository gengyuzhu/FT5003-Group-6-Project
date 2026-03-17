import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import {
  createOracleNetwork,
  simulatePriceRound,
  toggleMalicious as toggleMaliciousService,
  setMode as setModeService,
  resetNetwork as resetNetworkService,
} from "@/services/oracleService";
import { useLatestPrice } from "@/hooks/useOracleContract";

const TICK_INTERVAL = 3500; // ms between oracle price rounds

/**
 * useOracle — React hook for the decentralized oracle simulation
 *
 * When wallet is connected and on-chain oracle has data, the on-chain
 * price is blended into the simulation as a "ground truth" anchor.
 *
 * Returns:
 *   oracleState     — full oracle state (nodes, history, consensus, accuracy, etc.)
 *   setMode         — switch between "centralized" | "average" | "astrea"
 *   toggleMalicious — toggle a node's malicious status by id
 *   resetNetwork    — reset all nodes to initial state
 *   ethUsdPrice     — the consensus ETH/USD price (for use in stat cards)
 *   onChainPrice    — on-chain oracle price (null if unavailable)
 *   isOnChainAvailable — whether on-chain oracle data is available
 */
export function useOracle() {
  const [oracleState, setOracleState] = useState(() => createOracleNetwork());
  const intervalRef = useRef(null);
  const { isConnected } = useAccount();
  const { price: onChainPrice, timestamp: onChainTimestamp, isLoading: onChainLoading, error: onChainError } = useLatestPrice();

  const isOnChainAvailable = isConnected && !onChainLoading && !onChainError && onChainPrice !== null && onChainPrice > 0;

  // Start the simulation loop
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setOracleState((prev) => simulatePriceRound(prev));
    }, TICK_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const setMode = useCallback((mode) => {
    setOracleState((prev) => setModeService(prev, mode));
  }, []);

  const toggleMalicious = useCallback((nodeId) => {
    setOracleState((prev) => toggleMaliciousService(prev, nodeId));
  }, []);

  const resetNetwork = useCallback(() => {
    setOracleState(resetNetworkService());
  }, []);

  // Derive the final ETH/USD price: prefer on-chain when available
  const ethUsdPrice = isOnChainAvailable ? onChainPrice : oracleState.consensusPrice;

  return {
    oracleState,
    setMode,
    toggleMalicious,
    resetNetwork,
    ethUsdPrice,
    onChainPrice: isOnChainAvailable ? onChainPrice : null,
    onChainTimestamp: isOnChainAvailable ? onChainTimestamp : null,
    isOnChainAvailable,
  };
}
