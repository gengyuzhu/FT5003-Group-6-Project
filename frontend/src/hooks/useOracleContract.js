import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useCallback } from "react";

let ORACLE_ADDRESS = "0x0000000000000000000000000000000000000000";
let ORACLE_ABI = [];

try {
  const addresses = await import("@/config/deployed-addresses.json");
  ORACLE_ADDRESS = addresses.oracle || ORACLE_ADDRESS;
} catch {}

try {
  const abi = await import("@/config/abis/SimpleOracle.json");
  ORACLE_ABI = abi.default || abi;
} catch {}

export function useOracleAddress() {
  return ORACLE_ADDRESS;
}

/**
 * Read the latest finalized price from SimpleOracle.
 * Returns { price, timestamp, isLoading, error }.
 */
export function useLatestPrice() {
  const { data, isLoading, error } = useReadContract({
    address: ORACLE_ADDRESS,
    abi: ORACLE_ABI,
    functionName: "getLatestPrice",
  });

  const price = data ? Number(data[0]) : null;
  const timestamp = data ? Number(data[1]) : null;

  return { price, timestamp, isLoading, error };
}

/**
 * Read latest price without staleness check.
 */
export function useLatestPriceUnsafe() {
  const { data, isLoading, error } = useReadContract({
    address: ORACLE_ADDRESS,
    abi: ORACLE_ABI,
    functionName: "getLatestPriceUnsafe",
  });

  const price = data ? Number(data[0]) : null;
  const timestamp = data ? Number(data[1]) : null;

  return { price, timestamp, isLoading, error };
}

/**
 * Submit a price report (requires reporter role).
 */
export function useSubmitPrice() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const submit = useCallback(
    (price) => {
      writeContract({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "submitPrice",
        args: [BigInt(price)],
      });
    },
    [writeContract]
  );

  return { submit, hash, isPending, isConfirming, isSuccess, error };
}
