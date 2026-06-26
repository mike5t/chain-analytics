const { createClient } = require("@libsql/client");
const path = require("path");

const dbPath = path.join(__dirname, "../data/chain_analytics.db");
const client = createClient({
  url: `file:${dbPath}`,
});

async function main() {
  const wallet = "0x13347515bd79a6e67c2ebc0f48b8accc2b12c320".toLowerCase();

  const inflows = await client.execute({
    sql: "SELECT COUNT(*) as cnt FROM address_flows WHERE to_address = ?",
    args: [wallet]
  });
  console.log("Inflows count in DB:", inflows.rows[0].cnt);

  const outflows = await client.execute({
    sql: "SELECT COUNT(*) as cnt FROM address_flows WHERE from_address = ?",
    args: [wallet]
  });
  console.log("Outflows count in DB:", outflows.rows[0].cnt);

  const samples = await client.execute({
    sql: "SELECT from_address, to_address, amount, token, chain FROM address_flows WHERE from_address = ? OR to_address = ? LIMIT 10",
    args: [wallet, wallet]
  });
  console.log("Samples:");
  console.log(samples.rows);
}

main().catch(console.error);
