import fs from "fs";
import path from "path";
import { updateSanctionsList, countSanctioned } from "../src/lib/forensics/sanctions";

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

async function main() {
  console.log("Chain Analytics — OFAC Sanctions Update");
  console.log("=".repeat(50));

  const before = await countSanctioned();
  console.log(`Addresses in DB before update: ${before}`);

  try {
    const count = await updateSanctionsList();
    const after = await countSanctioned();
    console.log(`Addresses in DB after update:  ${after}`);
    console.log(`✅ Done — ${count} ETH addresses loaded from OFAC SDN list.`);
    process.exit(0);
  } catch (e: any) {
    console.error(`❌ Update failed: ${e.message || e}`);
    process.exit(1);
  }
}

main();
