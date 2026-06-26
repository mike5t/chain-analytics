import fs from "fs";
import path from "path";
import { getDb, storeFlows, storeRiskScore } from "../src/lib/db";
import { investigateAddress, investigateAllChains } from "../src/lib/etherscan";
import { traceHops, summariseHopGraph } from "../src/lib/forensics/hops";
import { profileWallet } from "../src/lib/forensics/profiler";
import { scoreWallet } from "../src/lib/forensics/risk";
import { isSanctioned } from "../src/lib/forensics/sanctions";

// Custom helper to load .env variables
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf-8")
      .split("\n")
      .forEach((line) => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = match[2] || "";
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          process.env[key] = val;
        }
      });
  }
}
loadEnv();

function printHelp() {
  console.log("Usage:");
  console.log("  npx tsx scripts/investigate.ts <0xWalletAddress> [options]");
  console.log("");
  console.log("Options:");
  console.log("  --chain <name>        Chain to investigate (default: all supported chains)");
  console.log("  --hops <number>       Trace N hops deep (0 = no hop tracing, default: 0)");
  console.log("  --min-amount <value>  Minimum amount for hop tracing (default: 0.1)");
  console.log("  --no-profile          Skip wallet profiler");
  console.log("  --no-risk             Skip risk scoring");
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  // First non-flag argument is the wallet
  let wallet = "";
  let chain: string | null = null;
  let hops = 0;
  let minAmount = 0.1;
  let noProfile = false;
  let noRisk = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--chain") {
      chain = args[i + 1] || null;
      i++;
    } else if (arg === "--hops") {
      hops = parseInt(args[i + 1] || "0");
      i++;
    } else if (arg === "--min-amount") {
      minAmount = parseFloat(args[i + 1] || "0.1");
      i++;
    } else if (arg === "--no-profile") {
      noProfile = true;
    } else if (arg === "--no-risk") {
      noRisk = true;
    } else if (!arg.startsWith("-")) {
      wallet = arg;
    }
  }

  if (!wallet || !wallet.startsWith("0x") || wallet.length !== 42) {
    console.error("Error: Invalid or missing wallet address.");
    printHelp();
  }

  const cleanWallet = wallet.toLowerCase();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Chain Analytics — Investigating ${cleanWallet}`);
  console.log(`${"=".repeat(60)}\n`);

  // ── Sanctions check ───────────────────────────────────────────────────────
  const sanctioned = await isSanctioned(cleanWallet);
  if (sanctioned) {
    console.log("⚠️  SANCTIONED ADDRESS — found in OFAC SDN list!\n");
  }

  // ── Transaction investigation ─────────────────────────────────────────────
  let chainsData: Record<string, any> = {};
  if (chain) {
    console.log(`[1/4] Fetching transactions on ${chain}...`);
    const data = await investigateAddress(cleanWallet, chain);
    chainsData[chain] = data;
  } else {
    console.log("[1/4] Fetching transactions across all chains...");
    const result = await investigateAllChains(cleanWallet);
    chainsData = result.chains;
  }

  let totalFlows = 0;
  for (const [c, data] of Object.entries(chainsData)) {
    const n = data.all_flows.length;
    if (n === 0) continue;
    totalFlows += n;
    const stored = await storeFlows(data.all_flows);
    console.log(
      `  ${c.padEnd(12)}  ${String(n).padStart(5)} txs  ` +
      `(in: ${data.inflows.length}, out: ${data.outflows.length}, burns: ${data.burns.length})` +
      `  → ${stored} stored`
    );
  }
  console.log(`\n  Total: ${totalFlows} transactions stored\n`);

  // ── Hop analysis ──────────────────────────────────────────────────────────
  if (hops > 0) {
    const hopChain = chain || "ethereum";
    console.log(`[2/4] Hop tracing (${hops} hops on ${hopChain})...`);
    const hopResult = await traceHops(cleanWallet, hopChain, hops, minAmount);
    const summary = summariseHopGraph(hopResult.graph);

    console.log(`\n  Addresses found: ${hopResult.addresses_found.length}`);
    console.log(`  Flow edges:      ${hopResult.graph.length}`);
    console.log(`\n  Top destinations:`);
    const topDestinations = Object.entries(summary).slice(0, 10);
    topDestinations.forEach(([addr, info], idx) => {
      console.log(`    ${String(idx + 1).padStart(2)}. ${addr}  ${info.total_received.toFixed(4)}  (${info.tx_count} txs)`);
    });
  } else {
    console.log("[2/4] Hop tracing skipped (use --hops N to enable)\n");
  }

  // ── Wallet profile ────────────────────────────────────────────────────────
  const profileChain = chain || "ethereum";
  if (!noProfile && totalFlows > 0) {
    console.log(`[3/4] Building wallet profile (${profileChain})...`);
    const p = await profileWallet(cleanWallet, profileChain);
    console.log(`  Age:            ${p.wallet_age_days !== null ? p.wallet_age_days : "?"} days`);
    console.log(`  Total txs:      ${p.total_txs}`);
    console.log(`  Recipients:     ${p.unique_recipients}`);
    console.log(`  Senders:        ${p.unique_senders}`);
    console.log(`  Total received: ${p.total_received.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`);
    console.log(`  Total sent:     ${p.total_sent.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`);
    if (p.top_tokens && p.top_tokens.length > 0) {
      console.log(`  Top token:      ${p.top_tokens[0].token}`);
    }
    console.log();
  } else {
    console.log("[3/4] Profile skipped\n");
  }

  // ── Risk score ────────────────────────────────────────────────────────────
  if (!noRisk) {
    console.log(`[4/4] Risk scoring (${profileChain})...`);
    const risk = await scoreWallet(cleanWallet, profileChain);
    await storeRiskScore(risk);
    const ratingIcon = risk.score >= 60 ? "🔴" : risk.score >= 30 ? "🟡" : "🟢";
    console.log(`  ${ratingIcon} Score: ${risk.score} / 100 — ${risk.rating}`);
    for (const flag of risk.flags) {
      console.log(`     • ${flag}`);
    }
    console.log();
  } else {
    console.log("[4/4] Risk score skipped\n");
  }

  console.log("Done. Data saved to data/chain_analytics.db");
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((e) => {
  console.error("Investigation failed:", e);
  process.exit(1);
});
