const FLASHBOTS_API = "https://blocks.flashbots.net/v1";

export async function getMevBundles(blockNumber: number): Promise<any[]> {
  try {
    const response = await fetch(`${FLASHBOTS_API}/blocks?block_number=${blockNumber}`, {
      method: "GET",
    });
    if (!response.ok) {
      throw new Error(`Flashbots API returned HTTP status ${response.status}`);
    }
    const data = await response.json();
    return data.blocks || [];
  } catch (e) {
    console.error(`[flashbots] getMevBundles error on block ${blockNumber}:`, e);
    return [];
  }
}

export async function checkWalletMev(wallet: string, blocks: number[]): Promise<any[]> {
  const cleanWallet = wallet.toLowerCase();
  const findings: any[] = [];

  for (const block of blocks) {
    try {
      const bundles = await getMevBundles(block);
      for (const bundle of bundles) {
        if (!bundle.transactions) continue;
        for (const tx of bundle.transactions) {
          if (
            (tx.from && tx.from.toLowerCase() === cleanWallet) ||
            (tx.to && tx.to.toLowerCase() === cleanWallet)
          ) {
            findings.push({
              block,
              bundle_type: bundle.type,
              miner_reward: bundle.miner_reward,
              coin_base_transfer: bundle.coinbase_transfer,
              tx_hash: tx.transaction_hash,
              gas_used: tx.gas_used,
            });
          }
        }
      }
    } catch (e) {
      console.error(`[flashbots] checkWalletMev error for block ${block}:`, e);
    }
  }

  return findings;
}

export function detectSandwich(flows: any[], targetTx: string): any | null {
  const target = flows.find((f) => f.tx_hash === targetTx);
  if (!target) return null;

  const block = target.block_number;
  const token = target.token;
  const sameBlock = flows.filter(
    (f) =>
      Number(f.block_number) === Number(block) &&
      f.token === token &&
      f.tx_hash !== targetTx
  );

  if (sameBlock.length >= 2) {
    return {
      target_tx: targetTx,
      block,
      token,
      likely_sandwich: true,
      surrounding_txs: sameBlock.map((f) => f.tx_hash),
      note: "Two or more same-token txs in the same block around target",
    };
  }

  return null;
}

export async function getMevSearcherActivity(searcherAddress: string, limit = 10): Promise<any[]> {
  try {
    const response = await fetch(
      `${FLASHBOTS_API}/bundles?eoa_address=${searcherAddress.toLowerCase()}&limit=${limit}`,
      { method: "GET" }
    );
    if (!response.ok) {
      throw new Error(`Flashbots bundles API returned status ${response.status}`);
    }
    const data = await response.json();
    return data.bundles || [];
  } catch (e) {
    console.error(`[flashbots] getMevSearcherActivity error:`, e);
    return [];
  }
}
