const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTCollection", function () {
  let nft, owner, alice, bob;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    nft = await NFTCollection.deploy();
  });

  describe("Minting", () => {
    it("should mint an NFT with correct URI and royalty", async () => {
      const uri = "ipfs://QmTest123";
      const royaltyFee = 500; // 5%

      await expect(nft.connect(alice).mintNFT(alice.address, uri, royaltyFee))
        .to.emit(nft, "NFTMinted")
        .withArgs(0, alice.address, uri, royaltyFee);

      expect(await nft.ownerOf(0)).to.equal(alice.address);
      expect(await nft.tokenURI(0)).to.equal(uri);
      expect(await nft.totalSupply()).to.equal(1);
    });

    it("should set correct royalty info", async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://test", 500);

      const [receiver, amount] = await nft.royaltyInfo(0, ethers.parseEther("1"));
      expect(receiver).to.equal(alice.address);
      expect(amount).to.equal(ethers.parseEther("0.05")); // 5%
    });

    it("should reject royalty fee above 10%", async () => {
      await expect(
        nft.connect(alice).mintNFT(alice.address, "ipfs://test", 1001)
      ).to.be.revertedWith("Royalty fee too high");
    });

    it("should increment token IDs", async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://1", 0);
      await nft.connect(bob).mintNFT(bob.address, "ipfs://2", 100);

      expect(await nft.totalSupply()).to.equal(2);
      expect(await nft.ownerOf(0)).to.equal(alice.address);
      expect(await nft.ownerOf(1)).to.equal(bob.address);
    });

    it("should allow minting to another address", async () => {
      await nft.connect(alice).mintNFT(bob.address, "ipfs://gift", 250);
      expect(await nft.ownerOf(0)).to.equal(bob.address);
    });
  });

  describe("Enumeration", () => {
    it("should support tokenOfOwnerByIndex", async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://1", 0);
      await nft.connect(alice).mintNFT(alice.address, "ipfs://2", 0);

      expect(await nft.balanceOf(alice.address)).to.equal(2);
      expect(await nft.tokenOfOwnerByIndex(alice.address, 0)).to.equal(0);
      expect(await nft.tokenOfOwnerByIndex(alice.address, 1)).to.equal(1);
    });
  });

  describe("ERC-2981 & ERC-165", () => {
    it("should support ERC-721, ERC-2981, and ERC-165 interfaces", async () => {
      // ERC-165
      expect(await nft.supportsInterface("0x01ffc9a7")).to.be.true;
      // ERC-721
      expect(await nft.supportsInterface("0x80ac58cd")).to.be.true;
      // ERC-2981
      expect(await nft.supportsInterface("0x2a55205a")).to.be.true;
    });

    it("getCreator should return royalty receiver", async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://test", 500);
      expect(await nft.getCreator(0)).to.equal(alice.address);
    });
  });
});
