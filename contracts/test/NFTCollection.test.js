const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NFTCollection", function () {
  let nft, owner, alice, bob, charlie;

  beforeEach(async () => {
    [owner, alice, bob, charlie] = await ethers.getSigners();
    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    nft = await NFTCollection.deploy();
  });

  describe("Minting", () => {
    it("should mint an NFT with correct URI and royalty", async () => {
      const uri = "ipfs://QmTest123";
      const royaltyFee = 500; // 5%

      await expect(nft.connect(alice).mintNFT(alice.address, uri, royaltyFee))
        .to.emit(nft, "NFTMinted")
        .withArgs(1, alice.address, uri, royaltyFee);

      expect(await nft.ownerOf(1)).to.equal(alice.address);
      expect(await nft.tokenURI(1)).to.equal(uri);
      expect(await nft.totalSupply()).to.equal(1);
    });

    it("should set correct royalty info", async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://test", 500);

      const [receiver, amount] = await nft.royaltyInfo(1, ethers.parseEther("1"));
      expect(receiver).to.equal(alice.address);
      expect(amount).to.equal(ethers.parseEther("0.05")); // 5%
    });

    it("should reject royalty fee above 10%", async () => {
      await expect(
        nft.connect(alice).mintNFT(alice.address, "ipfs://test", 1001)
      ).to.be.revertedWithCustomError(nft, "RoyaltyFeeTooHigh");
    });

    it("should increment token IDs", async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://1", 0);
      await nft.connect(bob).mintNFT(bob.address, "ipfs://2", 100);

      expect(await nft.totalSupply()).to.equal(2);
      expect(await nft.ownerOf(1)).to.equal(alice.address);
      expect(await nft.ownerOf(2)).to.equal(bob.address);
    });

    it("should allow minting to another address", async () => {
      await nft.connect(alice).mintNFT(bob.address, "ipfs://gift", 250);
      expect(await nft.ownerOf(1)).to.equal(bob.address);
    });
  });

  describe("Enumeration", () => {
    it("should support tokenOfOwnerByIndex", async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://1", 0);
      await nft.connect(alice).mintNFT(alice.address, "ipfs://2", 0);

      expect(await nft.balanceOf(alice.address)).to.equal(2);
      expect(await nft.tokenOfOwnerByIndex(alice.address, 0)).to.equal(1);
      expect(await nft.tokenOfOwnerByIndex(alice.address, 1)).to.equal(2);
    });
  });

  describe("ERC-2981 & ERC-165", () => {
    it("should support ERC-721, ERC-2981, ERC-165, and ERC-4907 interfaces", async () => {
      // ERC-165
      expect(await nft.supportsInterface("0x01ffc9a7")).to.be.true;
      // ERC-721
      expect(await nft.supportsInterface("0x80ac58cd")).to.be.true;
      // ERC-2981
      expect(await nft.supportsInterface("0x2a55205a")).to.be.true;
      // ERC-4907
      expect(await nft.supportsInterface("0xad092b5c")).to.be.true;
    });

    it("getCreator should return royalty receiver", async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://test", 500);
      expect(await nft.getCreator(1)).to.equal(alice.address);
    });
  });

  // ── ERC-4907: NFT Rental ──────────────────────────────────────────

  describe("ERC-4907 Rental", () => {
    beforeEach(async () => {
      await nft.connect(alice).mintNFT(alice.address, "ipfs://rental", 500);
    });

    it("owner can set user with expiry", async () => {
      const expires = BigInt(await time.latest()) + 86400n; // 1 day from now
      await expect(nft.connect(alice).setUser(1, bob.address, expires))
        .to.emit(nft, "UpdateUser")
        .withArgs(1, bob.address, expires);

      expect(await nft.userOf(1)).to.equal(bob.address);
      expect(await nft.userExpires(1)).to.equal(expires);
    });

    it("approved operator can set user", async () => {
      await nft.connect(alice).approve(bob.address, 1);
      const expires = BigInt(await time.latest()) + 86400n;
      await nft.connect(bob).setUser(1, charlie.address, expires);
      expect(await nft.userOf(1)).to.equal(charlie.address);
    });

    it("non-owner/non-approved cannot set user", async () => {
      const expires = BigInt(await time.latest()) + 86400n;
      await expect(
        nft.connect(bob).setUser(1, bob.address, expires)
      ).to.be.revertedWithCustomError(nft, "NotOwnerOrApproved");
    });

    it("userOf returns address(0) after expiry", async () => {
      const expires = BigInt(await time.latest()) + 100n;
      await nft.connect(alice).setUser(1, bob.address, expires);

      expect(await nft.userOf(1)).to.equal(bob.address);

      await time.increase(200);
      expect(await nft.userOf(1)).to.equal(ethers.ZeroAddress);
    });

    it("transfer clears user info", async () => {
      const expires = BigInt(await time.latest()) + 86400n;
      await nft.connect(alice).setUser(1, bob.address, expires);
      expect(await nft.userOf(1)).to.equal(bob.address);

      // Transfer NFT from alice to charlie
      await nft.connect(alice).transferFrom(alice.address, charlie.address, 1);

      // User should be cleared
      expect(await nft.userOf(1)).to.equal(ethers.ZeroAddress);
    });

    it("owner retains ownership during rental", async () => {
      const expires = BigInt(await time.latest()) + 86400n;
      await nft.connect(alice).setUser(1, bob.address, expires);

      // Alice still owns the NFT
      expect(await nft.ownerOf(1)).to.equal(alice.address);
      // Bob is the user
      expect(await nft.userOf(1)).to.equal(bob.address);
    });
  });

  // ── Collaborative Minting ──────────────────────────────────────────

  describe("Collaborative Minting", () => {
    it("should mint a collaborative NFT with shares summing to 10000", async () => {
      const creators = [alice.address, bob.address, charlie.address];
      const shares = [5000, 3000, 2000]; // 50%, 30%, 20%

      await expect(
        nft.connect(alice).collaborativeMint(alice.address, "ipfs://collab", 500, creators, shares)
      ).to.emit(nft, "CollaborativeMinted");

      expect(await nft.ownerOf(1)).to.equal(alice.address);
      expect(await nft.isCollaborative(1)).to.be.true;

      // Royalty receiver is the contract itself
      const [receiver] = await nft.royaltyInfo(1, ethers.parseEther("1"));
      expect(receiver).to.equal(await nft.getAddress());
    });

    it("should reject shares not summing to 10000", async () => {
      await expect(
        nft.connect(alice).collaborativeMint(alice.address, "ipfs://bad", 500, [alice.address, bob.address], [5000, 4000])
      ).to.be.revertedWithCustomError(nft, "InvalidSharesTotal");
    });

    it("should reject empty creators array", async () => {
      await expect(
        nft.connect(alice).collaborativeMint(alice.address, "ipfs://bad", 500, [], [])
      ).to.be.revertedWithCustomError(nft, "EmptyCreators");
    });

    it("should reject mismatched array lengths", async () => {
      await expect(
        nft.connect(alice).collaborativeMint(alice.address, "ipfs://bad", 500, [alice.address, bob.address], [10000])
      ).to.be.revertedWithCustomError(nft, "SharesLengthMismatch");
    });

    it("should distribute royalty to creators proportionally", async () => {
      const creators = [alice.address, bob.address];
      const shares = [7000, 3000]; // 70%, 30%

      await nft.connect(alice).collaborativeMint(alice.address, "ipfs://collab", 500, creators, shares);

      const royaltyAmount = ethers.parseEther("1.0");
      await nft.distributeRoyalty(1, { value: royaltyAmount });

      // Check pending payments
      const alicePayment = await nft.pendingCreatorPayments(alice.address);
      const bobPayment = await nft.pendingCreatorPayments(bob.address);

      expect(alicePayment).to.equal(royaltyAmount * 7000n / 10000n);
      expect(bobPayment).to.equal(royaltyAmount * 3000n / 10000n);
    });

    it("creators can withdraw payments", async () => {
      const creators = [alice.address, bob.address];
      const shares = [6000, 4000];

      await nft.connect(alice).collaborativeMint(alice.address, "ipfs://collab", 500, creators, shares);
      await nft.distributeRoyalty(1, { value: ethers.parseEther("1.0") });

      const balanceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await nft.connect(alice).withdrawCreatorPayment();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(alice.address);

      expect(balanceAfter - balanceBefore + gasCost).to.equal(ethers.parseEther("0.6"));
    });

    it("getCollabInfo returns correct data", async () => {
      const creators = [alice.address, bob.address];
      const shares = [5000, 5000];

      await nft.connect(alice).collaborativeMint(alice.address, "ipfs://collab", 500, creators, shares);

      const [retCreators, retShares] = await nft.getCollabInfo(1);
      expect(retCreators[0]).to.equal(alice.address);
      expect(retCreators[1]).to.equal(bob.address);
      expect(retShares[0]).to.equal(5000);
      expect(retShares[1]).to.equal(5000);
    });
  });
});
