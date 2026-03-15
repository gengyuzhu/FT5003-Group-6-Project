import { useState, useCallback } from "react";
import { uploadFileToIPFS, uploadMetadataToIPFS } from "@/utils/ipfs";

/**
 * Hook for uploading NFT image + metadata to IPFS.
 * Returns { upload, isUploading, tokenURI, error }.
 */
export function useIPFSUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [tokenURI, setTokenURI] = useState(null);
  const [error, setError] = useState(null);

  const upload = useCallback(async ({ file, name, description, attributes }) => {
    setIsUploading(true);
    setError(null);
    setTokenURI(null);

    try {
      // 1. Upload the image
      const imageURI = await uploadFileToIPFS(file);

      // 2. Build and upload metadata
      const metadata = {
        name,
        description,
        image: imageURI,
        attributes: attributes || [],
      };
      const metadataURI = await uploadMetadataToIPFS(metadata);

      setTokenURI(metadataURI);
      return metadataURI;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, []);

  return { upload, isUploading, tokenURI, error };
}
