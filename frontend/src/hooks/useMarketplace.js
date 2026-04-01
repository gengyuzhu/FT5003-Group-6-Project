import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useCallback } from "react";
import { parseEther, parseUnits } from "viem";
import { MARKETPLACE_ADDRESS, NFT_COLLECTION_ADDRESS, NFTMarketplaceABI as MARKETPLACE_ABI } from "@/config/contracts";

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

/**
 * List an NFT for a USD price.
 * @param priceUsd - USD string e.g. "100.50" → 10050 cents on-chain
 */
export function useListNFT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const list = useCallback(
    (nftContract, tokenId, priceUsd, durationSeconds = 0) => {
      // Convert USD string to cents BigInt: "100.50" → 10050n
      const cents = parseUnits(priceUsd.toString(), 2);
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "listNFT",
        args: [nftContract, BigInt(tokenId), cents, BigInt(durationSeconds)],
      });
    },
    [writeContract]
  );

  return { list, hash, isPending, isConfirming, isSuccess, error };
}

/**
 * Buy a listed NFT. Pass maxWei (BigInt) from getListingPriceInWei.
 */
export function useBuyNFT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const buy = useCallback(
    (listingId, maxWei) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "buyNFT",
        args: [BigInt(listingId)],
        value: maxWei,
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

/**
 * Update listing price (USD string → cents on-chain).
 */
export function useUpdateListingPrice() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const update = useCallback(
    (listingId, newPriceUsd) => {
      const cents = parseUnits(newPriceUsd.toString(), 2);
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "updateListingPrice",
        args: [BigInt(listingId), cents],
      });
    },
    [writeContract]
  );

  return { update, hash, isPending, isConfirming, isSuccess, error };
}

export function useCancelAuction() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancel = useCallback(
    (auctionId) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "cancelAuction",
        args: [BigInt(auctionId)],
      });
    },
    [writeContract]
  );

  return { cancel, hash, isPending, isConfirming, isSuccess, error };
}

export function useIsListingExpired(listingId) {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "isListingExpired",
    args: [BigInt(listingId ?? 0)],
    query: { enabled: listingId != null },
  });
}

/**
 * Read the oracle-computed ETH price for a listing.
 * Returns { requiredWei, maxWei } as BigInt.
 */
export function useGetListingPriceInWei(listingId) {
  const { data, ...rest } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getListingPriceInWei",
    args: [BigInt(listingId ?? 0)],
    query: { enabled: listingId != null },
  });

  return {
    requiredWei: data?.[0] ?? null,
    maxWei: data?.[1] ?? null,
    ...rest,
  };
}

/**
 * Batch list multiple NFTs in a single transaction.
 * @param pricesUsd - Array of USD strings e.g. ["100.50", "200.00"]
 */
export function useBatchListNFT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const batchList = useCallback(
    (nftContract, tokenIds, pricesUsd, durations) => {
      const centsArray = pricesUsd.map((p) => parseUnits(p.toString(), 2));
      const tokenIdsBigInt = tokenIds.map((id) => BigInt(id));
      const durationsBigInt = durations.map((d) => BigInt(d));
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "batchListNFT",
        args: [nftContract, tokenIdsBigInt, centsArray, durationsBigInt],
      });
    },
    [writeContract]
  );

  return { batchList, hash, isPending, isConfirming, isSuccess, error };
}

// ── Dutch Auction hooks ─────────────────────────────────────────────

export function useCreateDutchAuction() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const create = useCallback(
    (nftContract, tokenId, startPriceUsd, endPriceUsd, durationSeconds) => {
      const startCents = parseUnits(startPriceUsd.toString(), 2);
      const endCents = parseUnits(endPriceUsd.toString(), 2);
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "createDutchAuction",
        args: [nftContract, BigInt(tokenId), startCents, endCents, BigInt(durationSeconds)],
      });
    },
    [writeContract]
  );

  return { create, hash, isPending, isConfirming, isSuccess, error };
}

export function useBuyDutchAuction() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const buy = useCallback(
    (auctionId, maxWei) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "buyDutchAuction",
        args: [BigInt(auctionId)],
        value: maxWei,
      });
    },
    [writeContract]
  );

  return { buy, hash, isPending, isConfirming, isSuccess, error };
}

export function useGetDutchAuctionPriceInWei(auctionId) {
  const { data, ...rest } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getDutchAuctionPriceInWei",
    args: [BigInt(auctionId ?? 0)],
    query: { enabled: auctionId != null },
  });

  return {
    requiredWei: data?.[0] ?? null,
    maxWei: data?.[1] ?? null,
    ...rest,
  };
}

export function useDutchAuctionCount() {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getDutchAuctionCount",
  });
}

export function useCancelDutchAuction() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancel = useCallback(
    (auctionId) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "cancelDutchAuction",
        args: [BigInt(auctionId)],
      });
    },
    [writeContract]
  );

  return { cancel, hash, isPending, isConfirming, isSuccess, error };
}

// ── On-Chain Offer hooks ────────────────────────────────────────────

export function useMakeOffer() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const makeOffer = useCallback(
    (nftContract, tokenId, durationSeconds, amountEth) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "makeOffer",
        args: [nftContract, BigInt(tokenId), BigInt(durationSeconds)],
        value: parseEther(amountEth.toString()),
      });
    },
    [writeContract]
  );

  return { makeOffer, hash, isPending, isConfirming, isSuccess, error };
}

export function useAcceptOffer() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const accept = useCallback(
    (offerId) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "acceptOffer",
        args: [BigInt(offerId)],
      });
    },
    [writeContract]
  );

  return { accept, hash, isPending, isConfirming, isSuccess, error };
}

export function useCancelOffer() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancel = useCallback(
    (offerId) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "cancelOffer",
        args: [BigInt(offerId)],
      });
    },
    [writeContract]
  );

  return { cancel, hash, isPending, isConfirming, isSuccess, error };
}

export function useOfferCount() {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getOfferCount",
  });
}

// ── P2P Swap hooks ─────────────────────────────────────────────────

export function useProposeSwap() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const propose = useCallback(
    (counterparty, proposerNftContract, proposerTokenId, counterpartyNftContract, counterpartyTokenId, durationSeconds, ethTopUp = "0") => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "proposeSwap",
        args: [
          counterparty,
          proposerNftContract,
          BigInt(proposerTokenId),
          counterpartyNftContract,
          BigInt(counterpartyTokenId),
          BigInt(durationSeconds),
        ],
        value: parseEther(ethTopUp.toString()),
      });
    },
    [writeContract]
  );

  return { propose, hash, isPending, isConfirming, isSuccess, error };
}

export function useAcceptSwap() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const accept = useCallback(
    (swapId) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "acceptSwap",
        args: [BigInt(swapId)],
      });
    },
    [writeContract]
  );

  return { accept, hash, isPending, isConfirming, isSuccess, error };
}

export function useCancelSwap() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancel = useCallback(
    (swapId) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "cancelSwap",
        args: [BigInt(swapId)],
      });
    },
    [writeContract]
  );

  return { cancel, hash, isPending, isConfirming, isSuccess, error };
}

export function useSwapCount() {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getSwapCount",
  });
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

// ── Rental Hooks ─────────────────────────────────────────────────────

export function useListForRent() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const listForRent = useCallback(
    (nftContract, tokenId, dailyPriceUsdCents, maxDays) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "listForRent",
        args: [nftContract, tokenId, dailyPriceUsdCents, maxDays],
      });
    },
    [writeContract]
  );

  return { listForRent, hash, isPending, isConfirming, isSuccess, error };
}

export function useRentNFT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const rentNFT = useCallback(
    (rentalId, days, value) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "rentNFT",
        args: [rentalId, days],
        value,
      });
    },
    [writeContract]
  );

  return { rentNFT, hash, isPending, isConfirming, isSuccess, error };
}

export function useCancelRentalListing() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancelRentalListing = useCallback(
    (rentalId) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "cancelRentalListing",
        args: [rentalId],
      });
    },
    [writeContract]
  );

  return { cancelRentalListing, hash, isPending, isConfirming, isSuccess, error };
}

export function useRentalListingCount() {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getRentalListingCount",
  });
}

// ── Reputation Hooks ─────────────────────────────────────────────────

export function useRateTransaction() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const rateTransaction = useCallback(
    (txId, score) => {
      writeContract({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: "rateTransaction",
        args: [txId, score],
      });
    },
    [writeContract]
  );

  return { rateTransaction, hash, isPending, isConfirming, isSuccess, error };
}

export function useGetReputation(userAddress) {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getReputation",
    args: [userAddress],
    enabled: !!userAddress,
  });
}

export function useCompletedTxCount() {
  return useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: "getCompletedTxCount",
  });
}
