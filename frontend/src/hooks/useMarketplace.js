import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useCallback } from "react";
import { parseEther } from "viem";

// Default addresses
let MARKETPLACE_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
let MARKETPLACE_ABI = [];

try {
  const addresses = await import("@/config/deployed-addresses.json");
  MARKETPLACE_ADDRESS = addresses.marketplace || MARKETPLACE_ADDRESS;
} catch {}

try {
  const abi = await import("@/config/abis/NFTMarketplace.json");
  MARKETPLACE_ABI = abi.default || abi;
} catch {}

export function useMarketplaceAddress() {
  return MARKETPLACE_ADDRESS;
}

export function useMarketplaceABI() {
  return MARKETPLACE_ABI;
}

// ── Read hooks ──────────────────────────────────────────────────────

export function useListingCount() {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getListingCount",
  });
}

export function useAuctionCount() {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getAuctionCount",
  });
}

export function useListing(listingId) {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "listings",
    args: [BigInt(listingId ?? 0)],
    enabled: listingId != null,
  });
}

export function useAuction(auctionId) {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "auctions",
    args: [BigInt(auctionId ?? 0)],
    enabled: auctionId != null,
  });
}

export function usePlatformFee() {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "platformFeeBps",
  });
}

export function usePendingWithdrawal(address) {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "pendingWithdrawals",
    args: [address],
    enabled: !!address,
  });
}

// ── Write hooks ─────────────────────────────────────────────────────

export function useListNFT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const list = useCallback(
    (nftContract, tokenId, priceInEth) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "listNFT",
        args: [nftContract, BigInt(tokenId), parseEther(priceInEth.toString())],
      });
    },
    [writeContract]
  );

  return { list, hash, isPending, isConfirming, isSuccess, error };
}

export function useBuyNFT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const buy = useCallback(
    (listingId, price) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "buyNFT",
        args: [BigInt(listingId)],
        value: price,
      });
    },
    [writeContract]
  );

  return { buy, hash, isPending, isConfirming, isSuccess, error };
}

export function useCancelListing() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancel = useCallback(
    (listingId) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "cancelListing",
        args: [BigInt(listingId)],
      });
    },
    [writeContract]
  );

  return { cancel, hash, isPending, isConfirming, isSuccess, error };
}

export function useCreateAuction() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const create = useCallback(
    (nftContract, tokenId, startPriceEth, durationSeconds) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "createAuction",
        args: [
          nftContract,
          BigInt(tokenId),
          parseEther(startPriceEth.toString()),
          BigInt(durationSeconds),
        ],
      });
    },
    [writeContract]
  );

  return { create, hash, isPending, isConfirming, isSuccess, error };
}

export function usePlaceBid() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const bid = useCallback(
    (auctionId, bidAmountEth) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "placeBid",
        args: [BigInt(auctionId)],
        value: parseEther(bidAmountEth.toString()),
      });
    },
    [writeContract]
  );

  return { bid, hash, isPending, isConfirming, isSuccess, error };
}

export function useEndAuction() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const end = useCallback(
    (auctionId) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "endAuction",
        args: [BigInt(auctionId)],
      });
    },
    [writeContract]
  );

  return { end, hash, isPending, isConfirming, isSuccess, error };
}

export function useWithdraw() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const withdraw = useCallback(() => {
    writeContract({
      address: MARKETPLACE_ADDRESS,
      abi: MARKETPLACE_ABI,
      functionName: "withdraw",
    });
  }, [writeContract]);

  return { withdraw, hash, isPending, isConfirming, isSuccess, error };
}
