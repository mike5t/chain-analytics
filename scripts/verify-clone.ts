import { getDb, queryRows } from "../src/lib/db";
import { isSanctioned } from "../src/lib/forensics/sanctions";
import { scoreWallet } from "../src/lib/forensics/risk";

async function main() {
  console.log("=== Chain Analytics Rebuild Verification ===");
  
  try {
    const db = await getDb();
    console.log("✅ SQLite Database initialized successfully.");
    
    // Check tables
    const tablesRes = await queryRows(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    console.log("Available tables in DB:");
    tablesRes.forEach((row) => {
      console.log(`  - ${row.name}`);
    });
    
    // Count labels
    const labelRows = await queryRows("SELECT COUNT(*) AS cnt FROM address_labels");
    console.log(`Total address labels in DB: ${labelRows[0]?.cnt}`);
    
    // Count sanctions
    const sanctionsRows = await queryRows("SELECT COUNT(*) AS cnt FROM sanctions");
    console.log(`Total sanctions in DB: ${sanctionsRows[0]?.cnt}`);
    
    // Test a risk score mock
    console.log("Testing risk scoring logic imports...");
    const testAddress = "0x000000000000000000000000000000000000dead";
    const risk = await scoreWallet(testAddress, "ethereum");
    console.log(`Risk score for ${testAddress}: ${risk.score} (${risk.rating})`);
    console.log("Flags:", risk.flags);
    
    console.log("\n✅ All imports and basic DB functions are working perfectly!");
  } catch (e: any) {
    console.error("❌ Verification failed:", e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
