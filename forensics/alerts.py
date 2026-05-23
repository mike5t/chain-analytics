"""
Real-time wallet monitoring and alert system.

Polls for new transactions every N seconds and checks them
against stored alert_rules. Fires alerts to stdout and DB.

Alert types:
  threshold       — transfer amount >= threshold
  cex_deposit     — wallet sent funds to a known CEX
  new_counterparty — wallet interacted with an address it has never sent to before
"""

import asyncio
from web3 import Web3
from config.chains import CHAINS
from config.known_addresses import CEX_ADDRESSES
from db.database import get_conn


async def monitor_wallet(
    wallet: str,
    chain: str,
    poll_interval: int = 15,
) -> None:
    """
    Continuously poll for new transactions for a wallet and fire alert rules.
    Runs indefinitely until cancelled.

    Args:
        wallet:        Ethereum address to monitor.
        chain:         Chain name.
        poll_interval: Seconds between polls (default 15s).
    """
    w3     = Web3(Web3.HTTPProvider(CHAINS[chain]["rpc"]))
    conn   = get_conn()
    wallet = wallet.lower()

    # Start from the most recent known block for this wallet, or current block
    row = conn.execute("""
        SELECT MAX(block_number) FROM address_flows
        WHERE (from_address = ? OR to_address = ?) AND chain = ?
    """, [wallet, wallet, chain]).fetchone()
    last_block: int = row[0] or w3.eth.block_number
    conn.close()

    print(f"[monitor] Watching {wallet} on {chain} from block {last_block}")

    while True:
        try:
            current_block = w3.eth.block_number
            if current_block > last_block:
                from indexer.etherscan import fetch_token_transfers, fetch_native_transfers
                token_flows, native_flows = await asyncio.gather(
                    fetch_token_transfers(wallet, chain),
                    fetch_native_transfers(wallet, chain),
                )
                new_flows = [
                    f for f in token_flows + native_flows
                    if f["block_number"] > last_block
                ]
                if new_flows:
                    print(f"[monitor] {len(new_flows)} new tx(s) at block {current_block}")
                    conn2 = get_conn()
                    for flow in new_flows:
                        _check_rules(flow, conn2)
                    conn2.close()
                last_block = current_block
        except Exception as e:
            print(f"[monitor] poll error: {e}")

        await asyncio.sleep(poll_interval)


def _check_rules(flow: dict, conn) -> None:
    """Evaluate all active alert rules against a single flow."""
    rules = conn.execute("""
        SELECT id, alert_type, threshold FROM alert_rules
        WHERE (wallet = ? OR wallet = ?) AND chain = ? AND active = TRUE
    """, [flow["from_address"], flow["to_address"], flow["chain"]]).fetchall()

    for rule_id, alert_type, threshold in rules:
        message = _evaluate_rule(alert_type, threshold, flow, conn)
        if message:
            print(f"[ALERT] {message}")
            conn.execute("""
                INSERT INTO alerts_fired (id, rule_id, wallet, tx_hash, message)
                VALUES (nextval('alerts_fired_seq'), ?, ?, ?, ?)
            """, [rule_id, flow["from_address"], flow["tx_hash"], message])


def _evaluate_rule(
    alert_type: str, threshold: float, flow: dict, conn
) -> str | None:
    """Return an alert message if the rule fires, else None."""

    if alert_type == "threshold":
        if flow["amount"] >= threshold:
            return (
                f"LARGE TRANSFER: {flow['amount']:.4f} {flow['token']} "
                f"from {flow['from_address']} → {flow['to_address']}"
            )

    elif alert_type == "cex_deposit":
        if flow["to_address"] in CEX_ADDRESSES:
            return (
                f"CEX DEPOSIT: {flow['from_address']} sent "
                f"{flow['amount']:.4f} {flow['token']} to a known exchange"
            )

    elif alert_type == "new_counterparty":
        existing = conn.execute("""
            SELECT 1 FROM address_flows
            WHERE from_address = ? AND to_address = ? AND chain = ?
            LIMIT 1
        """, [flow["from_address"], flow["to_address"], flow["chain"]]).fetchone()
        if not existing:
            return (
                f"NEW COUNTERPARTY: {flow['from_address']} → {flow['to_address']} "
                f"({flow['amount']:.4f} {flow['token']})"
            )

    return None


def add_alert_rule(
    wallet: str,
    chain: str,
    alert_type: str,
    threshold: float = 0.0,
) -> int:
    """
    Add an alert rule to the database.
    Returns the new rule ID.
    """
    conn = get_conn()
    conn.execute("""
        INSERT INTO alert_rules (id, wallet, chain, alert_type, threshold, active)
        VALUES (nextval('alert_rules_seq'), ?, ?, ?, ?, TRUE)
    """, [wallet.lower(), chain, alert_type, threshold])
    row = conn.execute("SELECT MAX(id) FROM alert_rules").fetchone()
    rule_id = row[0]
    conn.close()
    return rule_id


def list_alert_rules() -> list[dict]:
    """Return all active alert rules."""
    conn  = get_conn()
    rows  = conn.execute(
        "SELECT id, wallet, chain, alert_type, threshold FROM alert_rules WHERE active = TRUE"
    ).fetchall()
    conn.close()
    return [
        {"id": r[0], "wallet": r[1], "chain": r[2], "alert_type": r[3], "threshold": r[4]}
        for r in rows
    ]
