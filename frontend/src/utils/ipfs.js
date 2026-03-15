/**
 * IPFS utilities for uploading NFT images and metadata.
 *
 * For production, integrate with Pinata or nft.storage.
 * For demo purposes we use a local mock that stores files as data URIs.
 */

const PINATA_JWT = import.meta.env.VITE_PINATA_JWT || "";
const PINATA_GATEWAY =
  import.meta.env.VITE_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";

/**
 * Upload a file to IPFS via Pinata.
 * Falls back to data URI for demo when no JWT is set.
 * @param {File} file
 * @returns {Promise<string>} ipfs:// URI
 */
export async function uploadFileToIPFS(file) {
  if (!PINATA_JWT) {
    // Demo fallback: convert file to data URI
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  });

  if (!res.ok) throw new Error("Failed to upload file to IPFS");
  const data = await res.json();
  return `ipfs://${data.IpfsHash}`;
}

/**
 * Upload JSON metadata to IPFS via Pinata.
 * Falls back to data URI for demo.
 * @param {object} metadata - { name, description, image, attributes }
 * @returns {Promise<string>} ipfs:// URI
 */
export async function uploadMetadataToIPFS(metadata) {
  if (!PINATA_JWT) {
    // Demo fallback: encode as data URI
    const json = JSON.stringify(metadata);
    return `data:application/json;base64,${btoa(json)}`;
  }

  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({ pinataContent: metadata }),
  });

  if (!res.ok) throw new Error("Failed to upload metadata to IPFS");
  const data = await res.json();
  return `ipfs://${data.IpfsHash}`;
}

/**
 * Resolve an IPFS URI to an HTTP gateway URL.
 */
export function resolveIPFS(uri) {
  if (!uri) return "";
  if (uri.startsWith("data:")) return uri;
  if (uri.startsWith("ipfs://")) {
    return `${PINATA_GATEWAY}/${uri.slice(7)}`;
  }
  return uri;
}

/**
 * Fetch and parse NFT metadata from a tokenURI.
 */
export async function fetchMetadata(tokenURI) {
  const url = resolveIPFS(tokenURI);

  if (url.startsWith("data:application/json;base64,")) {
    const json = atob(url.split(",")[1]);
    return JSON.parse(json);
  }

  if (url.startsWith("data:application/json,")) {
    return JSON.parse(decodeURIComponent(url.split(",")[1]));
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch metadata");
  return res.json();
}
