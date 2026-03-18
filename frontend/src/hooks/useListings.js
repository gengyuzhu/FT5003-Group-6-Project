import { useReadContract, useReadContracts } from "wagmi";
import { useMarketplaceAddress, useMarketplaceABI } from "./useMarketplace";

/**
 * Fetch all active listings from the marketplace contract via multicall.
 */
export function useAllListings() {
  const address = useMarketplaceAddress();
  const abi = useMarketplaceABI();

  const { data: countData, isLoading: countLoading } = useReadContract({
    address,
    abi,
    functionName: "getListingCount",
  });

  const count = countData ? Number(countData) : 0;

  const contracts = Array.from({ length: count }, (_, i) => ({
    address,
    abi,
    functionName: "listings",
    args: [BigInt(i)],
  }));

  const { data, isLoading: listingsLoading } = useReadContracts({
    contracts,
    query: { enabled: count > 0 },
  });

  const listings = (data || [])
    .map((result, i) => {
      if (result.status !== "success" || !result.result) return null;
      const [seller, nftContract, tokenId, priceUsdCents, active, expiration] = result.result;
      return {
        listingId: i,
        seller,
        nftContract,
        tokenId: Number(tokenId),
        priceUsdCents,                                      // BigInt: USD cents on-chain
        priceUsd: Number(priceUsdCents) / 100,              // JS number: e.g. 2091.00
        active,
        expiration: Number(expiration),
      };
    })
    .filter((l) => l && l.active);

  return { listings, isLoading: countLoading || listingsLoading, count };
}

/**
 * Fetch all active auctions from the marketplace contract via multicall.
 */
export function useAllAuctions() {
  const address = useMarketplaceAddress();
  const abi = useMarketplaceABI();

  const { data: countData, isLoading: countLoading } = useReadContract({
    address,
    abi,
    functionName: "getAuctionCount",
  });

  const count = countData ? Number(countData) : 0;

  const contracts = Array.from({ length: count }, (_, i) => ({
    address,
    abi,
    functionName: "auctions",
    args: [BigInt(i)],
  }));

  const { data, isLoading: auctionsLoading } = useReadContracts({
    contracts,
    query: { enabled: count > 0 },
  });

  const auctions = (data || [])
    .map((result, i) => {
      if (result.status !== "success" || !result.result) return null;
      const [seller, nftContract, tokenId, startPrice, highestBid, highestBidder, endTime, ended] = result.result;
      return {
        auctionId: i,
        seller,
        nftContract,
        tokenId: Number(tokenId),
        startPrice,
        highestBid,
        highestBidder,
        endTime: Number(endTime),
        ended,
      };
    })
    .filter((a) => a && !a.ended);

  return { auctions, isLoading: countLoading || auctionsLoading, count };
}
