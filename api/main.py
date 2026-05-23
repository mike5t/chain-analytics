"""
FastAPI — Chain Analytics REST API.

Exposes the core forensics capabilities as JSON endpoints.
Run with:  uvicorn api.main:app --reload --port 8000
"""

import asyncio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from indexer.rpc import get_all_native_balances, get_all_token_balances
from indexer.etherscan import investigate_all_chains, investigate_address
from forensics.hops import trace_hops, summarise_hop_graph
from forensics.profiler import profile_wallet
from forensics.risk import score_wallet
from forensics.sanctions import is_sanctioned, screen_address_list
from forensics.cluster import run_all_clustering
from forensics.alerts import add_alert_rule, list_alert_rules
from db.database import get_conn, store_flows

app = FastAPI(
    title="Chain Analytics API",
    description="Blockchain forensics — balance, flows, hops, risk, sanctions.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Balance ───────────────────────────────────────────────────────────────────

@app.get("/balance/{wallet}", tags=["Balance"])
def get_balances(wallet: str):
    """Return native token balances across all chains."""
    return get_all_native_balances(wallet)


@app.get("/balance/{wallet}/{chain}/tokens", tags=["Balance"])
def get_token_balances(wallet: str, chain: str):
    """Return all configured token balances for a wallet on a chain."""
    return get_all_token_balances(wallet, chain)


# ── Investigation ─────────────────────────────────────────────────────────────

@app.get("/investigate/{wallet}", tags=["Investigation"])
async def investigate(
    wallet: str,
    chain: str = Query(None, description="Chain name. Omit to investigate all chains."),
):
    """
    Fetch and store all inflows, outflows, and burns for a wallet.
    Returns flow counts per chain.
    """
    if chain:
        data = await investigate_address(wallet, chain)
        store_flows(data["all_flows"])
        return {
            "wallet":  wallet,
            "chain":   chain,
            "inflows": len(data["inflows"]),
            "outflows": len(data["outflows"]),
            "burns":   len(data["burns"]),
            "total":   len(data["all_flows"]),
        }
    else:
        result = await investigate_all_chains(wallet)
        summary = {}
        for ch, data in result["chains"].items():
            store_flows(data["all_flows"])
            summary[ch] = {
                "inflows":  len(data["inflows"]),
                "outflows": len(data["outflows"]),
                "burns":    len(data["burns"]),
                "total":    len(data["all_flows"]),
            }
        return {"wallet": wallet, "chains": summary}


# ── Hop Analysis ──────────────────────────────────────────────────────────────

@app.get("/hops/{wallet}", tags=["Hops"])
async def hop_analysis(
    wallet: str,
    chain: str = "ethereum",
    max_hops: int = Query(3, ge=1, le=5),
    min_amount: float = Query(0.1, ge=0),
):
    """Trace money from a wallet up to max_hops levels deep."""
    result  = await trace_hops(wallet, chain, max_hops, min_amount)
    summary = summarise_hop_graph(result["graph"])
    return {
        "start":            wallet,
        "chain":            chain,
        "hops":             max_hops,
        "addresses_found":  len(result["addresses_found"]),
        "edge_count":       len(result["graph"]),
        "top_destinations": dict(list(summary.items())[:20]),
    }


# ── Profiler ──────────────────────────────────────────────────────────────────

@app.get("/profile/{wallet}", tags=["Profiler"])
def profile(wallet: str, chain: str = "ethereum"):
    """Return full wallet profile from stored DuckDB data."""
    return profile_wallet(wallet, chain)


# ── Risk Scoring ──────────────────────────────────────────────────────────────

@app.get("/risk/{wallet}", tags=["Risk"])
def risk(wallet: str, chain: str = "ethereum"):
    """Score a wallet 0–100 for suspiciousness."""
    return score_wallet(wallet, chain)


# ── Sanctions ─────────────────────────────────────────────────────────────────

@app.get("/sanctions/{wallet}", tags=["Sanctions"])
def sanctions_check(wallet: str):
    """Check if a single wallet is on the OFAC sanctions list."""
    return {"wallet": wallet, "sanctioned": is_sanctioned(wallet)}


class ScreenRequest(BaseModel):
    addresses: list[str]

@app.post("/sanctions/screen", tags=["Sanctions"])
def sanctions_screen(body: ScreenRequest):
    """Screen a list of addresses against the OFAC sanctions list."""
    hits = screen_address_list(body.addresses)
    return {"total": len(body.addresses), "hits": len(hits), "sanctioned": hits}


# ── Clustering ────────────────────────────────────────────────────────────────

class ClusterRequest(BaseModel):
    addresses: list[str]
    chain: str = "ethereum"

@app.post("/cluster", tags=["Clustering"])
def cluster(body: ClusterRequest):
    """Run all clustering heuristics on a list of addresses."""
    return run_all_clustering(body.addresses, body.chain)


# ── Alerts ────────────────────────────────────────────────────────────────────

@app.get("/alerts/rules", tags=["Alerts"])
def get_rules():
    """List all active alert rules."""
    return list_alert_rules()


class AlertRuleRequest(BaseModel):
    wallet: str
    chain: str
    alert_type: str
    threshold: float = 0.0

@app.post("/alerts/rules", tags=["Alerts"])
def create_rule(body: AlertRuleRequest):
    """Create a new alert rule."""
    rule_id = add_alert_rule(body.wallet, body.chain, body.alert_type, body.threshold)
    return {"rule_id": rule_id, "status": "created"}


@app.get("/alerts/fired", tags=["Alerts"])
def get_fired_alerts(limit: int = 50):
    """Return the most recent fired alerts."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM alerts_fired ORDER BY fired_at DESC LIMIT ?", [limit]
    ).fetchdf()
    conn.close()
    return rows.to_dict(orient="records")


# ── SQL Query ─────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    sql: str

@app.post("/query", tags=["SQL"])
def run_query(body: QueryRequest):
    """
    Run an arbitrary SQL query against the DuckDB database.
    WARNING: No auth — for local use only.
    """
    try:
        conn = get_conn()
        df   = conn.execute(body.sql).fetchdf()
        conn.close()
        return df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
