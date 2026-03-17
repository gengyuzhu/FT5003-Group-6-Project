const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy NFTCollection
  const NFTCollection = await hre.ethers.getContractFactory("NFTCollection");
  const nft = await NFTCollection.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("NFTCollection deployed to:", nftAddress);

  // Deploy NFTMarketplace
  const NFTMarketplace = await hre.ethers.getContractFactory("NFTMarketplace");
  const marketplace = await NFTMarketplace.deploy();
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log("NFTMarketplace deployed to:", marketplaceAddress);

  // Deploy SimpleOracle
  const SimpleOracle = await hre.ethers.getContractFactory("SimpleOracle");
  const oracle = await SimpleOracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("SimpleOracle deployed to:", oracleAddress);

  // Write addresses to a JSON file for the frontend
  const fs = require("fs");
  const path = require("path");

  const addresses = {
    nftCollection: nftAddress,
    marketplace: marketplaceAddress,
    oracle: oracleAddress,
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "..", "frontend", "src", "config");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "deployed-addresses.json"),
    JSON.stringify(addresses, null, 2)
  );
  console.log("Addresses written to frontend/src/config/deployed-addresses.json");

  // Also copy ABIs
  const abiDir = path.join(outDir, "abis");
  fs.mkdirSync(abiDir, { recursive: true });

  const nftArtifact = await hre.artifacts.readArtifact("NFTCollection");
  fs.writeFileSync(
    path.join(abiDir, "NFTCollection.json"),
    JSON.stringify(nftArtifact.abi, null, 2)
  );

  const mktArtifact = await hre.artifacts.readArtifact("NFTMarketplace");
  fs.writeFileSync(
    path.join(abiDir, "NFTMarketplace.json"),
    JSON.stringify(mktArtifact.abi, null, 2)
  );

  const oracleArtifact = await hre.artifacts.readArtifact("SimpleOracle");
  fs.writeFileSync(
    path.join(abiDir, "SimpleOracle.json"),
    JSON.stringify(oracleArtifact.abi, null, 2)
  );
  console.log("ABIs written to frontend/src/config/abis/");

  console.log("\nDeployment complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
