import { useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { useState, useEffect, useCallback } from "react";
import { fetchMetadata, resolveIPFS } from "@/utils/ipfs";

// Default addresses — will be overwritten after deploy
let NFT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
let NFT_ABI = [];

// Dynamic import of deployed config
try {
  const addresses = await import("@/config/deployed-addresses.json");
  NFT_ADDRESS = addresses.nftCollection || NFT_ADDRESS;
} catch {}

try {
  const abi = await import("@/config/abis/NFTCollection.json");
  NFT_ABI = abi.default || abi;
} catch {}

export function useNFTAddress() {
  return NFT_ADDRESS;
}

export function useNFTABI() {
  return NFT_ABI;
}

/**
 * Read total supply of NFTs.
 */
export function useTotalSupply() {
  return useReadContract({
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: "totalSupply",
  });
}

/**
 * Read token URI for a given token ID.
 */
export function useTokenURI(tokenId) {
  return useReadContract({
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: "tokenURI",
    args: [BigInt(tokenId ?? 0)],
    enabled: tokenId != null,
  });
}

/**
 * Read owner of a token.
 */
export function useTokenOwner(tokenId) {
  return useReadContract({
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: "ownerOf",
    args: [BigInt(tokenId ?? 0)],
    enabled: tokenId != null,
  });
}

/**
 * Get creator (royalty receiver) of a token.
 */
export function useTokenCreator(tokenId) {
  return useReadContract({
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: "getCreator",
    args: [BigInt(tokenId ?? 0)],
    enabled: tokenId != null,
  });
}

/**
 * Mint a new NFT.
 */
export function useMintNFT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const mint = useCallback(
    (to, tokenURI, royaltyFee) => {
      writeContract({
        address: NFT_ADDRESS,
        abi: NFT_ABI,
        functionName: "mintNFT",
        args: [to, tokenURI, royaltyFee],
      });
    },
    [writeContract]
  );

  return { mint, hash, isPending, isConfirming, isSuccess, error };
}

/**
 * Approve marketplace to transfer a token.
 */
export function useApproveNFT() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = useCallback(
    (spender, tokenId) => {
      writeContract({
        address: NFT_ADDRESS,
        abi: NFT_ABI,
        functionName: "approve",
        args: [spender, BigInt(tokenId)],
      });
    },
    [writeContract]
  );

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}

/**
 * Fetch metadata for a single NFT (tokenId).
 * Returns { metadata, imageUrl, isLoading, error }.
 */
export function useNFTMetadata(tokenId) {
  const { data: tokenURI } = useTokenURI(tokenId);
  const [metadata, setMetadata] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tokenURI) return;
    let cancelled = false;
    setIsLoading(true);

    fetchMetadata(tokenURI)
      .then((data) => {
        if (cancelled) return;
        setMetadata(data);
        setImageUrl(resolveIPFS(data.image));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tokenURI]);

  return { metadata, imageUrl, isLoading, error };
}

/**
 * Fetch all NFTs owned by the connected user.
 * Returns array of { tokenId, metadata, imageUrl }.
 */
export function useUserNFTs() {
  const { address } = useAccount();
  const { data: balance } = useReadContract({
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address },
  });

  const count = balance ? Number(balance) : 0;

  // Multicall: get all tokenOfOwnerByIndex in one batch
  const indexContracts = Array.from({ length: count }, (_, i) => ({
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: "tokenOfOwnerByIndex",
    args: [address, BigInt(i)],
  }));

  const { data: tokenIdResults, isLoading: idsLoading } = useReadContracts({
    contracts: indexContracts,
    query: { enabled: count > 0 },
  });

  // Extract token IDs
  const tokenIds = (tokenIdResults || [])
    .filter((r) => r.status === "success")
    .map((r) => Number(r.result));

  // Multicall: get tokenURI for each owned token
  const uriContracts = tokenIds.map((tid) => ({
    address: NFT_ADDRESS,
    abi: NFT_ABI,
    functionName: "tokenURI",
    args: [BigInt(tid)],
  }));

  const { data: uriResults, isLoading: urisLoading } = useReadContracts({
    contracts: uriContracts,
    query: { enabled: tokenIds.length > 0 },
  });

  // Resolve metadata
  const [nfts, setNfts] = useState([]);
  const [metaLoading, setMetaLoading] = useState(false);

  useEffect(() => {
    if (!uriResults || uriResults.length === 0) {
      setNfts([]);
      return;
    }
    let cancelled = false;
    setMetaLoading(true);

    const load = async () => {
      const items = [];
      for (let i = 0; i < uriResults.length; i++) {
        const r = uriResults[i];
        if (r.status !== "success" || !r.result) continue;
        try {
          const meta = await fetchMetadata(r.result);
          items.push({
            tokenId: tokenIds[i],
            metadata: meta,
            imageUrl: resolveIPFS(meta.image),
            name: meta.name || `Token #${tokenIds[i]}`,
          });
        } catch {
          items.push({ tokenId: tokenIds[i], metadata: null, imageUrl: "", name: `Token #${tokenIds[i]}` });
        }
      }
      if (!cancelled) {
        setNfts(items);
        setMetaLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [uriResults, tokenIds.join(",")]);

  return { nfts, isLoading: idsLoading || urisLoading || metaLoading, balance: count };
}
