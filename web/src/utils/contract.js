// Web3 Contract Utilities (using window.ethereum directly)
import { MEDICAL_RECORDS_ABI } from "./contractABI";

// Load ethers from CDN
let ethers = null;

export const loadEthers = async () => {
  if (ethers) return ethers;

  if (typeof window !== "undefined") {
    // Load ethers from CDN (unpkg is more reliable)
    if (!window.ethers) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/ethers@5.7.2/dist/ethers.umd.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    ethers = window.ethers;
  }

  return ethers;
};

export const getContract = async (signerOrProvider) => {
  const eth = await loadEthers();
  if (!eth) return null;

  // Use NEXT_PUBLIC_ prefix (per vite.config.ts), with deployed address as fallback
  const contractAddress = import.meta.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x818FC828b579910ec415d606e4EA34B380cF1d06";
  if (!contractAddress) {
    throw new Error(
      "Contract address not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS",
    );
  }
  return new eth.Contract(
    contractAddress,
    MEDICAL_RECORDS_ABI,
    signerOrProvider,
  );
};

export const getProvider = async () => {
  const eth = await loadEthers();
  if (typeof window !== "undefined" && window.ethereum) {
    return new eth.providers.Web3Provider(window.ethereum);
  }
  // Fallback to RPC provider
  const rpcUrl = import.meta.env.NEXT_PUBLIC_RPC_URL;
  if (rpcUrl) {
    return new eth.providers.JsonRpcProvider(rpcUrl);
  }
  throw new Error("No Web3 provider available");
};

export const getSigner = async () => {
  const provider = await getProvider();
  return await provider.getSigner();
};

export const connectWallet = async () => {
  if (typeof window === "undefined") return null;

  if (!window.ethereum) {
    throw new Error(
      "MetaMask is not installed. Please install MetaMask to continue.",
    );
  }

  const accounts = await window.ethereum.request({
    method: "eth_requestAccounts",
  });

  return accounts[0];
};

export const getCurrentAccount = async () => {
  if (typeof window === "undefined" || !window.ethereum) return null;

  const accounts = await window.ethereum.request({
    method: "eth_accounts",
  });

  return accounts[0] || null;
};

export const formatAddress = (address) => {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};
