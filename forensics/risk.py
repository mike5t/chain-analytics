"""
Risk scoring — scores a wallet 0-100. Higher = more suspicious.

Scoring factors:
  +50  Directly sanctioned (OFAC)
  +40  Interacted with sanctioned address
  +35  Interacted with known hacker address
  +25  Interacted with Tornado Cash / mixer (label DB)
  +20  Interacted with scam/phishing address
  +15  High volume of mixer interactions (>5 txs)
  +10  Sent tokens to burn address
  +10  New wallet (< 30 days old)
  +10  No CEX interactions (fully anonymous)
  -10  Funded from known CEX (lower risk signal)
"""

from datetime import datetime
from db.database import get_conn
from config.known_addresses import CEX_ADDRESSES, MIXER_ADDRESSES


def _get_label(address: str, conn) -> tuple[str, str] | None:
    """Return (label, category) for an address if known."""
    row = conn.execute(
        "SELECT label, category FROM address_labels WHERE address = ?",
        [address.lower()]
    ).fetchone()
    return (row[0], row[1]) if row else None


def _is_sanctioned(address: str, conn) -> bool:
    return conn.execute(
        "SELECT 1 FROM sanctions WHERE address = ?", [address.lower()]
    ).fetchone() is not None


def score_wallet(wallet: str, chain: str) -> dict:
    """
    Score a wallet 0–100 and return rating + flag list.
    Returns: {wallet, chain, score, rating, flags, labels}
    """
    conn  = get_conn()
    w     = wallet.lower()
    score = 0
    flags = []

    # ── Direct sanctions hit ──────────────────────────────────────────────────
    if _is_sanctioned(w, conn):
        score += 50
        flags.append("🚨 SANCTIONED ADDRESS (OFAC SDN list)")

    # ── Interaction with sanctioned addresses ─────────────────────────────────
    sanc_hits = conn.execute("""
        SELECT COUNT(*)
        FROM address_flows f
        JOIN sanctions s ON (f.to_address = s.address OR f.from_address = s.address)
        WHERE (f.from_address = ? OR f.to_address = ?) AND f.chain = ?
    """, [w, w, chain]).fetchone()[0]
    if sanc_hits > 0:
        score += 40
        flags.append(f"🚨 Interacted with {sanc_hits} SANCTIONED address(es)")

    # ── Label-based counterparty checks ──────────────────────────────────────
    counterparties = conn.execute("""
        SELECT DISTINCT
            CASE WHEN from_address = ? THEN to_address ELSE from_address END AS counterparty
        FROM address_flows
        WHERE (from_address = ? OR to_address = ?) AND chain = ?
    """, [w, w, w, chain]).fetchall()

    mixer_hits  = 0
    hacker_hits = 0
    scam_hits   = 0
    cex_hits    = 0
    defi_hits   = 0
    found_labels = []

    for (cp,) in counterparties:
        info = _get_label(cp, conn)
        if not info:
            continue
        label, category = info
        found_labels.append({"address": cp, "label": label, "category": category})

        if category == "mixer":
            mixer_hits += 1
        elif category == "hacker":
            hacker_hits += 1
        elif category == "scam":
            scam_hits += 1
        elif category == "cex":
            cex_hits += 1
        elif category in ("dex", "lending", "staking"):
            defi_hits += 1

    if mixer_hits > 0:
        score += 25
        flags.append(f"⚠️ Interacted with {mixer_hits} mixer address(es) (Tornado Cash etc.)")
    if mixer_hits > 5:
        score += 15
        flags.append(f"🔴 High mixer exposure — {mixer_hits} interactions")
    if hacker_hits > 0:
        score += 35
        flags.append(f"🚨 Interacted with {hacker_hits} known HACKER address(es)")
    if scam_hits > 0:
        score += 20
        flags.append(f"⚠️ Interacted with {scam_hits} known SCAM/PHISHING address(es)")
    if cex_hits > 0:
        score -= 10
        flags.append(f"✅ Interacted with {cex_hits} known CEX(es) — lower risk signal")
    if defi_hits > 0:
        flags.append(f"ℹ️ Uses DeFi protocols ({defi_hits} known contracts)")

    # ── Fallback mixer check (config/known_addresses.py) ─────────────────────
    if mixer_hits == 0 and MIXER_ADDRESSES:
        mixer_list = ",".join(["?" for _ in MIXER_ADDRESSES])
        old_mixer = conn.execute(f"""
            SELECT COUNT(*) FROM address_flows
            WHERE (from_address = ? OR to_address = ?)
              AND (to_address IN ({mixer_list}) OR from_address IN ({mixer_list}))
              AND chain = ?
        """, [w, w] + list(MIXER_ADDRESSES) + list(MIXER_ADDRESSES) + [chain]).fetchone()[0]
        if old_mixer > 0:
            score += 20
            flags.append(f"⚠️ Interacted with Tornado Cash / mixer {old_mixer} time(s)")

    # ── Burns ─────────────────────────────────────────────────────────────────
    burns = conn.execute("""
        SELECT COUNT(*) FROM address_flows
        WHERE from_address = ?
          AND to_address = '0x000000000000000000000000000000000000dead'
          AND chain = ?
    """, [w, chain]).fetchone()[0]
    if burns > 0:
        score += 10
        flags.append(f"Sent to burn address {burns} time(s)")

    # ── CEX funding (fallback from config) ────────────────────────────────────
    if cex_hits == 0 and CEX_ADDRESSES:
        cex_list = ",".join(["?" for _ in CEX_ADDRESSES])
        cex_funded = conn.execute(f"""
            SELECT COUNT(*) FROM address_flows
            WHERE to_address = ? AND chain = ?
              AND from_address IN ({cex_list})
        """, [w, chain] + list(CEX_ADDRESSES)).fetchone()[0]
        if cex_funded > 0:
            score -= 10
            flags.append("✅ Funded from known CEX (lower risk)")

    # ── No CEX interaction at all = more anonymous ────────────────────────────
    total_txs = conn.execute("""
        SELECT COUNT(*) FROM address_flows
        WHERE (from_address = ? OR to_address = ?) AND chain = ?
    """, [w, w, chain]).fetchone()[0]
    if total_txs > 10 and cex_hits == 0:
        score += 10
        flags.append("ℹ️ No exchange interactions — fully on-chain activity")

    # ── Wallet age ────────────────────────────────────────────────────────────
    age_row = conn.execute("""
        SELECT MIN(block_time) FROM address_flows
        WHERE (from_address = ? OR to_address = ?) AND chain = ?
    """, [w, w, chain]).fetchone()
    if age_row and age_row[0]:
        age_days = (datetime.now() - age_row[0]).days
        if age_days < 30:
            score += 10
            flags.append(f"⚠️ New wallet — only {age_days} days old")

    conn.close()
    score = max(0, min(100, score))

    return {
        "wallet":       wallet,
        "chain":        chain,
        "score":        score,
        "rating":       "HIGH RISK" if score >= 60 else "MEDIUM RISK" if score >= 30 else "LOW RISK",
        "flags":        flags,
        "labels_found": found_labels,
    }
