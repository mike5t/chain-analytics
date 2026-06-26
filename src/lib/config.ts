export const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";
export const ETHERSCAN_KEY = process.env.ETHERSCAN_KEY || "";

export interface ChainConfig {
  rpc: string;
  chain_id: number;
  explorer: string;
  explorer_key: string;
  explorer_supported: boolean;
  explorer_v2: boolean;
  native: string;
}

export const CHAINS: Record<string, ChainConfig> = {
  ethereum: {
    rpc: "https://ethereum-rpc.publicnode.com",
    chain_id: 1,
    explorer: ETHERSCAN_V2,
    explorer_key: ETHERSCAN_KEY,
    explorer_supported: true,
    explorer_v2: true,
    native: "ETH",
  },
  base: {
    rpc: "https://mainnet.base.org",
    chain_id: 8453,
    explorer: "https://base.blockscout.com/api",
    explorer_key: "",
    explorer_supported: true,
    explorer_v2: false,
    native: "ETH",
  },
  arbitrum: {
    rpc: "https://arb1.arbitrum.io/rpc",
    chain_id: 42161,
    explorer: ETHERSCAN_V2,
    explorer_key: ETHERSCAN_KEY,
    explorer_supported: true,
    explorer_v2: true,
    native: "ETH",
  },
  polygon: {
    rpc: "https://polygon-bor-rpc.publicnode.com",
    chain_id: 137,
    explorer: ETHERSCAN_V2,
    explorer_key: ETHERSCAN_KEY,
    explorer_supported: true,
    explorer_v2: true,
    native: "MATIC",
  },
  optimism: {
    rpc: "https://mainnet.optimism.io",
    chain_id: 10,
    explorer: "https://optimism.blockscout.com/api",
    explorer_key: "",
    explorer_supported: true,
    explorer_v2: false,
    native: "ETH",
  },
  bsc: {
    rpc: "https://bsc-dataseed.binance.org",
    chain_id: 56,
    explorer: ETHERSCAN_V2,
    explorer_key: ETHERSCAN_KEY,
    explorer_supported: false,
    explorer_v2: true,
    native: "BNB",
  },
  scroll: {
    rpc: "https://scroll-rpc.publicnode.com",
    chain_id: 534352,
    explorer: "https://scrollscan.com/api",
    explorer_key: "",
    explorer_supported: true,
    explorer_v2: false,
    native: "ETH",
  },
  avalanche: {
    rpc: "https://avalanche-c-chain-rpc.publicnode.com",
    chain_id: 43114,
    explorer: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api",
    explorer_key: "",
    explorer_supported: true,
    explorer_v2: false,
    native: "AVAX",
  },
};

export interface TokenConfig {
  address: string;
  decimals: number;
}

export const TOKENS: Record<string, Record<string, TokenConfig>> = {
  ethereum: {
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    DAI:  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
    WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  },
  base: {
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
  arbitrum: {
    USDC: { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6 },
    USDT: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    WETH: { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
  },
  polygon: {
    USDC: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
    USDT: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    WETH: { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
    WMATIC: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  },
  optimism: {
    USDC: { address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", decimals: 6 },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
  bsc: {
    USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    BUSD: { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
    WBNB: { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
  },
};

export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface AddressMeta {
  label: string;
  category: string;
}

export const KNOWN_ADDRESSES: Record<string, AddressMeta> = {
  // CEX
  "0x28c6c06298d514db089934071355e5743bf21d60": { label: "Binance Hot Wallet",   category: "cex" },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": { label: "Binance Cold Wallet",  category: "cex" },
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": { label: "Binance US",            category: "cex" },
  "0xeb2629a2734e272bcc07bf1039e2dd5f63d5c9b4": { label: "Coinbase",              category: "cex" },
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": { label: "Coinbase 2",            category: "cex" },
  "0x0d0707963952f2fba59dd06f2b425ace40b492fe": { label: "Gate.io",               category: "cex" },
  "0xf89d7b9c864f589bbf53a82105107622b35eaa40": { label: "Bybit",                 category: "cex" },
  "0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67": { label: "Binance 14",            category: "cex" },

  // DeFi Protocols
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": { label: "Uniswap V2 Router",    category: "defi" },
  "0xe592427a0aece92de3edee1f18e0157c05861564": { label: "Uniswap V3 Router",    category: "defi" },
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": { label: "Uniswap Universal Router", category: "defi" },
  "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": { label: "Aave V3 Pool",         category: "defi" },
  "0xc3d688b66703497daa19211eedff47f25384cdc3": { label: "Compound V3",          category: "defi" },
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": { label: "SushiSwap Router",     category: "defi" },
  "0xba12222222228d8ba445958a75a0704d566bf2c8": { label: "Balancer Vault",        category: "defi" },
  "0x1111111254eeb25477b68fb85ed929f73a960582": { label: "1inch V5",              category: "defi" },

  // Bridges
  "0x3ee18b2214aff97000d974cf647e7c347e8fa585": { label: "Wormhole Bridge",      category: "bridge" },
  "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f": { label: "Arbitrum Bridge",      category: "bridge" },
  "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1": { label: "Optimism Bridge",      category: "bridge" },
  "0x3154cf16ccdb4c6d922629664174b904d80f2c35": { label: "Base Bridge",          category: "bridge" },

  // Mixers / Privacy
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b": { label: "Tornado Cash 0.1 ETH", category: "mixer" },
  "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf": { label: "Tornado Cash 10 ETH",  category: "mixer" },
  "0xa160cdab225685da1d56aa342ad8841c3b53f291": { label: "Tornado Cash 100 ETH", category: "mixer" },

  // Burn
  "0x000000000000000000000000000000000000dead": { label: "Burn Address",         category: "burn" },
  "0x0000000000000000000000000000000000000000": { label: "Zero Address",         category: "burn" },
};

export const CEX_ADDRESSES = new Set(
  Object.keys(KNOWN_ADDRESSES)
    .filter((addr) => KNOWN_ADDRESSES[addr].category === "cex")
    .map((a) => a.toLowerCase())
);

export const MIXER_ADDRESSES = new Set(
  Object.keys(KNOWN_ADDRESSES)
    .filter((addr) => KNOWN_ADDRESSES[addr].category === "mixer")
    .map((a) => a.toLowerCase())
);

export const BRIDGE_ADDRESSES = new Set(
  Object.keys(KNOWN_ADDRESSES)
    .filter((addr) => KNOWN_ADDRESSES[addr].category === "bridge")
    .map((a) => a.toLowerCase())
);
