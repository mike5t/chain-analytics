"""
Chain Analytics — Streamlit Dashboard
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import concurrent.futures
import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime

from db.database import get_conn, store_flows, store_swaps, store_lending, store_alchemy_transfers
from indexer.rpc import get_all_native_balances, get_all_token_balances
from indexer.etherscan import investigate_all_chains, investigate_address
from indexer.thegraph import get_uniswap_swaps, get_aave_activity, get_global_swap_stats
from indexer.alchemy import get_asset_transfers, count_wallets_by_threshold
from forensics.hops import trace_hops, summarise_hop_graph
from forensics.profiler import profile_wallet
from forensics.risk import score_wallet
from forensics.sanctions import screen_address_list, count_sanctioned
from forensics.cluster import run_all_clustering
from forensics.alerts import add_alert_rule, list_alert_rules

# ── Page config ───────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Chain Analytics",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
    .metric-card {
        background: #1e1e2e;
        border-radius: 12px;
        padding: 1rem 1.25rem;
        border: 1px solid #333;
    }
    .risk-low    { color: #22c55e; font-size: 3rem; font-weight: 900; }
    .risk-medium { color: #f59e0b; font-size: 3rem; font-weight: 900; }
    .risk-high   { color: #ef4444; font-size: 3rem; font-weight: 900; }
    div[data-testid="stMetricValue"] { font-size: 1.6rem; }
</style>
""", unsafe_allow_html=True)

from config.chains import CHAINS as CHAIN_CFG
CHAINS          = list(CHAIN_CFG.keys())
CHAINS_EXPLORER = [c for c, v in CHAIN_CFG.items() if v.get("explorer_supported", True)]

# ── Sidebar ───────────────────────────────────────────────────────────────────

with st.sidebar:
    st.image("https://africasblockchainclub.com/About/ABC_HD_White.png", width=100)
    st.title("Chain Analytics")
    st.caption("Blockchain Forensics")
    st.divider()
    page = st.radio("Navigate", options=[
        "🏠 Wallet Checker",
        "🔎 Investigate Address",
        "🕸️ Hop Analysis",
        "👤 Wallet Profile",
        "⚠️ Risk Score",
        "🔄 DeFi Activity",
        "🚫 Sanctions Screen",
        "🗃️ SQL Query",
        "🔔 Alerts",
        "📡 Chain Trends (Alchemy)",
        "🦄 DeFi Explorer (The Graph)",
    ])
    st.divider()
    n_sanctions = count_sanctioned()
    st.metric("OFAC addresses", n_sanctions)
    st.divider()
    st.caption("**Chain support**")
    for c in CHAINS:
        supported = CHAIN_CFG[c].get("explorer_supported", True)
        icon = "✅" if supported else "🔵"
        label = c.upper()
        st.caption(f"{icon} {label}" + ("" if supported else " (RPC only)"))

def _run(coro):
    # Run in a fresh thread so there is no pre-existing event loop to conflict with
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()

def _risk_gauge(score: int) -> go.Figure:
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=score,
        domain={"x": [0, 1], "y": [0, 1]},
        gauge={
            "axis": {"range": [0, 100], "tickwidth": 1, "tickcolor": "#aaa"},
            "bar":  {"color": "#ef4444" if score >= 60 else "#f59e0b" if score >= 30 else "#22c55e"},
            "steps": [
                {"range": [0,  30], "color": "#14532d"},
                {"range": [30, 60], "color": "#78350f"},
                {"range": [60, 100], "color": "#450a0a"},
            ],
            "threshold": {"line": {"color": "white", "width": 3}, "value": score},
        },
        number={"suffix": "/100", "font": {"size": 28}},
        title={"text": "Risk Score", "font": {"size": 16}},
    ))
    fig.update_layout(
        height=260, margin=dict(t=40, b=10, l=20, r=20),
        paper_bgcolor="rgba(0,0,0,0)", font_color="#ccc",
    )
    return fig


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: Wallet Checker
# ══════════════════════════════════════════════════════════════════════════════

if page == "🏠 Wallet Checker":
    st.title("🏠 Wallet Balance Checker")
    st.caption("Live native + ERC-20 balances via direct RPC — no API key needed.")

    wallet = st.text_input("Wallet Address", placeholder="0x...", key="wc_wallet")
    col_l, col_r = st.columns(2)
    check_native = col_l.button("Check Native Balances", use_container_width=True)
    check_tokens = col_r.button("Check Token Balances", use_container_width=True)
    chain = st.selectbox("Token chain (ERC-20)", CHAINS, key="wc_chain")

    if check_native and wallet:
        with st.spinner("Querying all 6 chains..."):
            balances = get_all_native_balances(wallet)

        st.subheader("Native Balances")
        # Metric cards
        cols = st.columns(3)
        for i, (ch, bal) in enumerate(balances.items()):
            val = f"{bal:.4f}" if isinstance(bal, float) else str(bal)
            cols[i % 3].metric(ch.upper(), val)

        # Bar chart — only numeric values
        df = pd.DataFrame([
            {"Chain": ch, "Balance": bal}
            for ch, bal in balances.items() if isinstance(bal, float)
        ])
        if not df.empty and df["Balance"].sum() > 0:
            st.subheader("Balance Distribution")
            fig = px.bar(
                df, x="Chain", y="Balance", color="Chain",
                color_discrete_sequence=px.colors.qualitative.Set2,
                template="plotly_dark",
            )
            fig.update_layout(showlegend=False, height=320,
                              paper_bgcolor="rgba(0,0,0,0)",
                              plot_bgcolor="rgba(0,0,0,0)")
            st.plotly_chart(fig, use_container_width=True)

    if check_tokens and wallet:
        with st.spinner(f"Querying {chain}..."):
            tokens = get_all_token_balances(wallet, chain)
        st.subheader(f"Token Balances on {chain.title()}")
        df = pd.DataFrame(
            [{"Token": t, "Balance": bal} for t, bal in tokens.items() if bal > 0],
        )
        if df.empty:
            st.info("No token balances found on this chain.")
        else:
            fig = px.bar(df, x="Token", y="Balance", color="Token",
                         color_discrete_sequence=px.colors.qualitative.Pastel,
                         template="plotly_dark")
            fig.update_layout(showlegend=False, height=320,
                              paper_bgcolor="rgba(0,0,0,0)",
                              plot_bgcolor="rgba(0,0,0,0)")
            st.plotly_chart(fig, use_container_width=True)
            st.dataframe(df, use_container_width=True, hide_index=True)


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: Investigate Address
# ══════════════════════════════════════════════════════════════════════════════

elif page == "🔎 Investigate Address":
    st.title("🔎 Address Investigation")
    st.caption("Fetch all inflows, outflows, and burns. Results stored in DuckDB and visualized below.")

    wallet     = st.text_input("Target Address", placeholder="0x...", key="inv_wallet")
    chain_mode = st.radio("Chains", ["All Chains", "Single Chain"], horizontal=True)
    chain      = st.selectbox("Chain", CHAINS_EXPLORER, key="inv_chain") if chain_mode == "Single Chain" else None

    if st.button("🔍 Investigate", use_container_width=True, type="primary") and wallet:
        with st.spinner("Fetching transactions from all chains..."):
            if chain:
                data   = _run(investigate_address(wallet, chain))
                result = {"wallet": wallet, "chains": {chain: data}}
            else:
                result = _run(investigate_all_chains(wallet))

        all_flows_combined = []
        for ch, data in result["chains"].items():
            if data["all_flows"]:
                store_flows(data["all_flows"])
                all_flows_combined.extend(data["all_flows"])

        if not all_flows_combined:
            st.warning("No transactions found for this address.")
            st.stop()

        df_all = pd.DataFrame(all_flows_combined)
        df_all["block_time"] = pd.to_datetime(df_all["block_time"])
        df_all["direction"] = df_all["to_address"].apply(
            lambda x: "IN" if x == wallet.lower() else "OUT"
        )

        # ── Summary row ──────────────────────────────────────────────────────
        st.divider()
        total   = len(df_all)
        inflows = (df_all["direction"] == "IN").sum()
        outflows = (df_all["direction"] == "OUT").sum()
        chains_active = df_all["chain"].nunique()

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Total Transactions", f"{total:,}")
        c2.metric("📥 Inflows",  f"{inflows:,}")
        c3.metric("📤 Outflows", f"{outflows:,}")
        c4.metric("Active Chains", chains_active)

        # ── Tabs ─────────────────────────────────────────────────────────────
        tab1, tab2, tab3, tab4 = st.tabs(["📊 Overview", "📋 Transactions", "⚠️ Risk", "🏷️ Chains"])

        with tab1:
            col_left, col_right = st.columns(2)

            # Timeline
            with col_left:
                st.subheader("Transaction Timeline")
                timeline = (
                    df_all.set_index("block_time")
                    .resample("W")["tx_hash"]
                    .count()
                    .reset_index()
                    .rename(columns={"tx_hash": "tx_count"})
                )
                fig = px.area(timeline, x="block_time", y="tx_count",
                              labels={"block_time": "Date", "tx_count": "Transactions"},
                              template="plotly_dark", color_discrete_sequence=["#818cf8"])
                fig.update_layout(height=280, paper_bgcolor="rgba(0,0,0,0)",
                                  plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=20))
                st.plotly_chart(fig, use_container_width=True)

            # In vs Out donut
            with col_right:
                st.subheader("Inflow vs Outflow")
                fig = px.pie(
                    names=["Inflows", "Outflows"],
                    values=[inflows, outflows],
                    hole=0.55,
                    color_discrete_sequence=["#22c55e", "#ef4444"],
                    template="plotly_dark",
                )
                fig.update_traces(textinfo="percent+label")
                fig.update_layout(height=280, paper_bgcolor="rgba(0,0,0,0)",
                                  showlegend=False, margin=dict(t=20))
                st.plotly_chart(fig, use_container_width=True)

            # Top tokens by volume
            st.subheader("Top Tokens by Volume")
            token_vol = (
                df_all[df_all["token"].str.len() > 0]
                .groupby("token")["amount"]
                .sum()
                .sort_values(ascending=False)
                .head(15)
                .reset_index()
            )
            if not token_vol.empty:
                fig = px.bar(token_vol, x="token", y="amount", color="token",
                             labels={"token": "Token", "amount": "Volume"},
                             color_discrete_sequence=px.colors.qualitative.Set3,
                             template="plotly_dark")
                fig.update_layout(showlegend=False, height=300,
                                  paper_bgcolor="rgba(0,0,0,0)",
                                  plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                st.plotly_chart(fig, use_container_width=True)

            # Top counterparties
            col_a, col_b = st.columns(2)
            with col_a:
                st.subheader("Top Senders")
                senders = (
                    df_all[df_all["direction"] == "IN"]
                    .groupby("from_address")["tx_hash"].count()
                    .sort_values(ascending=False).head(8).reset_index()
                    .rename(columns={"from_address": "address", "tx_hash": "txs"})
                )
                if not senders.empty:
                    senders["address"] = senders["address"].str[:10] + "..."
                    fig = px.bar(senders, x="txs", y="address", orientation="h",
                                 template="plotly_dark",
                                 color_discrete_sequence=["#22c55e"])
                    fig.update_layout(height=280, paper_bgcolor="rgba(0,0,0,0)",
                                      plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                    st.plotly_chart(fig, use_container_width=True)

            with col_b:
                st.subheader("Top Recipients")
                recips = (
                    df_all[df_all["direction"] == "OUT"]
                    .groupby("to_address")["tx_hash"].count()
                    .sort_values(ascending=False).head(8).reset_index()
                    .rename(columns={"to_address": "address", "tx_hash": "txs"})
                )
                if not recips.empty:
                    recips["address"] = recips["address"].str[:10] + "..."
                    fig = px.bar(recips, x="txs", y="address", orientation="h",
                                 template="plotly_dark",
                                 color_discrete_sequence=["#ef4444"])
                    fig.update_layout(height=280, paper_bgcolor="rgba(0,0,0,0)",
                                      plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                    st.plotly_chart(fig, use_container_width=True)

        with tab2:
            st.subheader(f"All {total:,} Transactions")
            filt_dir = st.radio("Filter", ["All", "IN only", "OUT only"], horizontal=True)
            df_show = df_all.copy()
            if filt_dir == "IN only":
                df_show = df_show[df_show["direction"] == "IN"]
            elif filt_dir == "OUT only":
                df_show = df_show[df_show["direction"] == "OUT"]

            df_show = df_show.sort_values("block_time", ascending=False)
            st.dataframe(
                df_show[["block_time", "chain", "direction", "token", "amount",
                          "from_address", "to_address", "tx_hash"]],
                use_container_width=True,
                hide_index=True,
                height=500,
            )

        with tab3:
            st.subheader("Risk Assessment")
            risk_chain = chain or "ethereum"
            with st.spinner("Scoring..."):
                risk = score_wallet(wallet, risk_chain)

            col_gauge, col_flags = st.columns([1, 1])
            with col_gauge:
                st.plotly_chart(_risk_gauge(risk["score"]), use_container_width=True)
                label = risk["rating"]
                if risk["score"] >= 60:
                    st.error(f"🔴 **{label}**")
                elif risk["score"] >= 30:
                    st.warning(f"🟡 **{label}**")
                else:
                    st.success(f"🟢 **{label}**")

            with col_flags:
                st.subheader("Risk Flags")
                if risk["flags"]:
                    for flag in risk["flags"]:
                        st.warning(f"⚠️ {flag}")
                else:
                    st.success("✅ No risk flags detected.")

        with tab4:
            st.subheader("Activity by Chain")
            chain_counts = df_all.groupby("chain")["tx_hash"].count().reset_index()
            chain_counts.columns = ["Chain", "Transactions"]
            fig = px.pie(chain_counts, names="Chain", values="Transactions",
                         color_discrete_sequence=px.colors.qualitative.Set2,
                         template="plotly_dark", hole=0.4)
            fig.update_layout(height=320, paper_bgcolor="rgba(0,0,0,0)")
            st.plotly_chart(fig, use_container_width=True)
            st.dataframe(chain_counts, use_container_width=True, hide_index=True)


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: Hop Analysis
# ══════════════════════════════════════════════════════════════════════════════

elif page == "🕸️ Hop Analysis":
    st.title("🕸️ Hop Analysis — Follow the Money")
    st.caption("BFS traversal: traces where money flows from a starting address, hop by hop.")

    wallet  = st.text_input("Start Address", placeholder="0x...", key="hop_wallet")
    col1, col2, col3 = st.columns(3)
    chain   = col1.selectbox("Chain", CHAINS_EXPLORER, key="hop_chain")
    hops    = col2.slider("Max Hops", 1, 5, 2)
    min_amt = col3.number_input("Min Amount", value=0.1, min_value=0.0, step=0.01)

    if st.button("🕸️ Trace Hops", use_container_width=True, type="primary") and wallet:
        with st.spinner(f"Tracing {hops} hop(s)... this may take a minute."):
            result  = _run(trace_hops(wallet, chain, hops, min_amt))
            summary = summarise_hop_graph(result["graph"])

        c1, c2 = st.columns(2)
        c1.metric("Addresses Found", len(result["addresses_found"]))
        c2.metric("Flow Edges",      len(result["graph"]))

        if summary:
            st.subheader("Top Destinations by Volume Received")
            df_sum = pd.DataFrame([
                {"address": addr[:12] + "...", "total_received": info["total_received"],
                 "tx_count": info["tx_count"], "tokens": ", ".join(info["tokens"])}
                for addr, info in list(summary.items())[:20]
            ])
            fig = px.bar(df_sum, x="total_received", y="address", orientation="h",
                         color="tx_count", color_continuous_scale="Viridis",
                         labels={"total_received": "Total Received", "address": "Address"},
                         template="plotly_dark")
            fig.update_layout(height=max(300, len(df_sum) * 28),
                              paper_bgcolor="rgba(0,0,0,0)",
                              plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
            st.plotly_chart(fig, use_container_width=True)

            st.subheader("Full Destination Table")
            st.dataframe(pd.DataFrame([
                {"address": addr, **info} for addr, info in summary.items()
            ]), use_container_width=True, hide_index=True)

        if result["graph"]:
            st.subheader("Flow Edges (Raw)")
            st.dataframe(pd.DataFrame(result["graph"]), use_container_width=True,
                         hide_index=True, height=300)


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: Wallet Profile
# ══════════════════════════════════════════════════════════════════════════════

elif page == "👤 Wallet Profile":
    st.title("👤 Wallet Profiler")
    st.caption("Behavioural profile built from data in DuckDB. Run **Investigate Address** first.")

    wallet = st.text_input("Wallet Address", placeholder="0x...", key="prof_wallet")
    chain  = st.selectbox("Chain", CHAINS_EXPLORER, key="prof_chain")

    if st.button("📊 Generate Profile", use_container_width=True, type="primary") and wallet:
        p = profile_wallet(wallet, chain)

        # Top metrics
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Wallet Age",        f"{p['wallet_age_days'] or '—'} days")
        c2.metric("Total Txs",         f"{p['total_txs']:,}")
        c3.metric("Unique Recipients", f"{p['unique_recipients']:,}")
        c4.metric("Unique Senders",    f"{p['unique_senders']:,}")

        c5, c6 = st.columns(2)
        c5.metric("Total Received", f"{p['total_received']:,.4f}")
        c6.metric("Total Sent",     f"{p['total_sent']:,.4f}")

        tab1, tab2, tab3 = st.tabs(["⏰ Hourly Activity", "🪙 Top Tokens", "🤝 Counterparties"])

        with tab1:
            if p["hourly_activity"]:
                df_h = pd.DataFrame(p["hourly_activity"])
                df_h["hour_label"] = df_h["hour"].apply(lambda h: f"{h:02d}:00")
                fig = px.bar(df_h, x="hour_label", y="txs",
                             labels={"hour_label": "Hour (UTC)", "txs": "Transactions"},
                             color="txs", color_continuous_scale="Purples",
                             template="plotly_dark")
                fig.update_layout(height=320, paper_bgcolor="rgba(0,0,0,0)",
                                  plot_bgcolor="rgba(0,0,0,0)", showlegend=False,
                                  margin=dict(t=10))
                st.plotly_chart(fig, use_container_width=True)
            else:
                st.info("No hourly data found — run Investigate first.")

        with tab2:
            if p["top_tokens"]:
                df_t = pd.DataFrame(p["top_tokens"])
                fig = px.bar(df_t, x="token", y="volume",
                             color="token",
                             color_discrete_sequence=px.colors.qualitative.Set3,
                             template="plotly_dark")
                fig.update_layout(height=300, showlegend=False,
                                  paper_bgcolor="rgba(0,0,0,0)",
                                  plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                st.plotly_chart(fig, use_container_width=True)
                st.dataframe(df_t, use_container_width=True, hide_index=True)
            else:
                st.info("No token data found.")

        with tab3:
            ca, cb = st.columns(2)
            with ca:
                st.subheader("Top Sent To")
                if p["top_sent_to"]:
                    df_s = pd.DataFrame(p["top_sent_to"])
                    df_s["address"] = df_s["address"].str[:12] + "..."
                    fig = px.bar(df_s, x="txs", y="address", orientation="h",
                                 template="plotly_dark",
                                 color_discrete_sequence=["#ef4444"])
                    fig.update_layout(height=300, paper_bgcolor="rgba(0,0,0,0)",
                                      plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                    st.plotly_chart(fig, use_container_width=True)
            with cb:
                st.subheader("Top Received From")
                if p["top_received_from"]:
                    df_r = pd.DataFrame(p["top_received_from"])
                    df_r["address"] = df_r["address"].str[:12] + "..."
                    fig = px.bar(df_r, x="txs", y="address", orientation="h",
                                 template="plotly_dark",
                                 color_discrete_sequence=["#22c55e"])
                    fig.update_layout(height=300, paper_bgcolor="rgba(0,0,0,0)",
                                      plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                    st.plotly_chart(fig, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: Risk Score
# ══════════════════════════════════════════════════════════════════════════════

elif page == "⚠️ Risk Score":
    st.title("⚠️ Risk Scorer")
    st.caption("Score a wallet 0–100. Higher = more suspicious.")

    wallet = st.text_input("Wallet Address", placeholder="0x...", key="risk_wallet")
    chain  = st.selectbox("Chain", CHAINS_EXPLORER, key="risk_chain")

    if st.button("🎯 Calculate Risk Score", use_container_width=True, type="primary") and wallet:
        with st.spinner("Scoring..."):
            result = score_wallet(wallet, chain)

        score = result["score"]
        col_gauge, col_detail = st.columns([1, 1])

        with col_gauge:
            st.plotly_chart(_risk_gauge(score), use_container_width=True)
            if score >= 60:
                st.error(f"🔴 **HIGH RISK — {score}/100**")
            elif score >= 30:
                st.warning(f"🟡 **MEDIUM RISK — {score}/100**")
            else:
                st.success(f"🟢 **LOW RISK — {score}/100**")

        with col_detail:
            st.subheader("Risk Flags")
            if result["flags"]:
                for flag in result["flags"]:
                    st.warning(f"⚠️ {flag}")
            else:
                st.success("✅ No risk flags detected.")

            st.subheader("Score Breakdown")
            components = {
                "Base score":          20,
                "Risk flags":          max(0, score - 20),
            }
            df_score = pd.DataFrame(
                [{"Component": k, "Points": v} for k, v in components.items()]
            )
            fig = px.bar(df_score, x="Points", y="Component", orientation="h",
                         color="Points", color_continuous_scale="RdYlGn_r",
                         template="plotly_dark")
            fig.update_layout(height=180, paper_bgcolor="rgba(0,0,0,0)",
                              plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=5),
                              showlegend=False)
            st.plotly_chart(fig, use_container_width=True)


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: DeFi Activity
# ══════════════════════════════════════════════════════════════════════════════

elif page == "🔄 DeFi Activity":
    st.title("🔄 DeFi Activity")
    st.caption("Uniswap V3 swaps and Aave V3 lending detected via Etherscan transaction history.")

    wallet = st.text_input("Wallet Address", placeholder="0x...", key="defi_wallet")

    if st.button("📡 Fetch DeFi Data", use_container_width=True, type="primary") and wallet:
        with st.spinner("Scanning for DeFi activity..."):
            swaps, lending = _run(asyncio.gather(
                get_uniswap_swaps(wallet),
                get_aave_activity(wallet),
            ))

        tab_uni, tab_aave = st.tabs(["🦄 Uniswap Swaps", "🏛️ Aave Lending"])

        with tab_uni:
            st.metric("Total Uniswap Swaps Found", len(swaps))
            if swaps:
                store_swaps(swaps)
                df_s = pd.DataFrame(swaps)
                df_s["block_time"] = pd.to_datetime(df_s["block_time"])

                # Timeline
                timeline = df_s.set_index("block_time").resample("W")["tx_hash"].count()
                fig = px.area(timeline.reset_index(), x="block_time", y="tx_hash",
                              labels={"block_time": "Date", "tx_hash": "Swaps"},
                              template="plotly_dark",
                              color_discrete_sequence=["#f97316"])
                fig.update_layout(height=240, paper_bgcolor="rgba(0,0,0,0)",
                                  plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                st.plotly_chart(fig, use_container_width=True)
                st.dataframe(df_s[["block_time", "token_in", "token_out",
                                   "amount_in", "tx_hash"]],
                             use_container_width=True, hide_index=True, height=300)
            else:
                st.info("No Uniswap swaps found for this address.")

        with tab_aave:
            st.metric("Total Aave Events Found", len(lending))
            if lending:
                store_lending(lending)
                df_l = pd.DataFrame(lending)
                df_l["block_time"] = pd.to_datetime(df_l["block_time"])

                action_counts = df_l["action"].value_counts().reset_index()
                action_counts.columns = ["Action", "Count"]
                fig = px.pie(action_counts, names="Action", values="Count",
                             color_discrete_sequence=px.colors.qualitative.Set2,
                             template="plotly_dark", hole=0.4)
                fig.update_layout(height=260, paper_bgcolor="rgba(0,0,0,0)")
                st.plotly_chart(fig, use_container_width=True)
                st.dataframe(df_l[["block_time", "action", "token", "amount", "tx_hash"]],
                             use_container_width=True, hide_index=True, height=300)
            else:
                st.info("No Aave activity found for this address.")


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: Sanctions Screen
# ══════════════════════════════════════════════════════════════════════════════

elif page == "🚫 Sanctions Screen":
    st.title("🚫 Sanctions Screening")
    st.caption("Screen addresses against the local OFAC SDN list.")

    raw = st.text_area(
        "Paste addresses (one per line)",
        height=200,
        placeholder="0xabc...\n0xdef...",
        key="sanc_input",
    )

    if st.button("🔎 Screen Addresses", use_container_width=True, type="primary") and raw:
        addresses = [a.strip() for a in raw.splitlines() if a.strip()]
        with st.spinner(f"Screening {len(addresses)} address(es)..."):
            hits = screen_address_list(addresses)

        c1, c2, c3 = st.columns(3)
        c1.metric("Addresses Screened", len(addresses))
        c2.metric("Sanctioned Hits",    len(hits),
                  delta=f"{'⚠️ ' if hits else ''}{len(hits)} found",
                  delta_color="inverse" if hits else "off")
        c3.metric("OFAC DB Size", count_sanctioned())

        st.divider()
        if hits:
            st.error(f"🚨 **{len(hits)} sanctioned address(es) detected!**")
            st.dataframe(pd.DataFrame(hits), use_container_width=True, hide_index=True)
        else:
            st.success("✅ **All clear — no sanctioned addresses found.**")

        # Show which ones are clean
        clean = [a for a in addresses if a.lower() not in [h["address"].lower() for h in hits]]
        if clean:
            with st.expander(f"✅ {len(clean)} clean address(es)"):
                for a in clean:
                    st.code(a)


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: SQL Query
# ══════════════════════════════════════════════════════════════════════════════

elif page == "🗃️ SQL Query":
    st.title("🗃️ SQL Query — DuckDB")
    st.caption("Direct SQL against the local DuckDB file at `data/chain_analytics.duckdb`.")

    # DB stats
    conn = get_conn()
    tables_info = []
    for (tbl,) in conn.execute("SHOW TABLES").fetchall():
        count = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        tables_info.append({"Table": tbl, "Rows": count})
    conn.close()

    with st.expander("📁 Database Tables", expanded=True):
        df_tables = pd.DataFrame(tables_info)
        st.dataframe(df_tables, use_container_width=True, hide_index=True)

    example_queries = {
        "Top senders by volume": """SELECT from_address, token, ROUND(SUM(amount),4) AS total, COUNT(*) AS txs
FROM address_flows
GROUP BY from_address, token
ORDER BY total DESC LIMIT 20""",
        "Recent transactions": """SELECT block_time, chain, token, amount, from_address, to_address
FROM address_flows
ORDER BY block_time DESC LIMIT 50""",
        "Transactions by chain": """SELECT chain, COUNT(*) AS txs, ROUND(SUM(amount),2) AS volume
FROM address_flows GROUP BY chain ORDER BY txs DESC""",
        "2-hop money trace": """SELECT a.from_address, a.to_address AS middle,
       b.to_address AS final, a.amount AS first_amt, b.amount AS second_amt
FROM address_flows a
JOIN address_flows b ON a.to_address = b.from_address
WHERE a.from_address = '0xSOURCE' LIMIT 50""",
        "High risk wallets": """SELECT address, score, rating, flags
FROM risk_scores ORDER BY score DESC""",
        "Hourly activity heatmap": """SELECT EXTRACT(HOUR FROM block_time) AS hour, COUNT(*) AS txs
FROM address_flows
GROUP BY hour ORDER BY hour""",
    }

    selected = st.selectbox("Example queries", ["Custom"] + list(example_queries.keys()))
    default  = "" if selected == "Custom" else example_queries[selected]
    query    = st.text_area("SQL", value=default, height=140, key="sql_input")

    col_run, col_chart = st.columns([3, 1])
    run_query = col_run.button("▶ Run Query", use_container_width=True, type="primary")
    show_chart = col_chart.checkbox("Auto-chart", value=True)

    if run_query and query:
        try:
            conn = get_conn()
            df   = conn.execute(query).fetchdf()
            conn.close()

            st.metric("Rows returned", len(df))
            st.dataframe(df, use_container_width=True, hide_index=True, height=400)

            if show_chart and not df.empty and len(df.columns) >= 2:
                num_cols = df.select_dtypes("number").columns.tolist()
                cat_cols = df.select_dtypes(exclude="number").columns.tolist()
                if num_cols and cat_cols:
                    fig = px.bar(df.head(30), x=cat_cols[0], y=num_cols[0],
                                 color=num_cols[0], color_continuous_scale="Viridis",
                                 template="plotly_dark")
                    fig.update_layout(height=350, paper_bgcolor="rgba(0,0,0,0)",
                                      plot_bgcolor="rgba(0,0,0,0)", showlegend=False)
                    st.plotly_chart(fig, use_container_width=True)
        except Exception as e:
            st.error(f"Query error: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: Alerts
# ══════════════════════════════════════════════════════════════════════════════

elif page == "🔔 Alerts":
    st.title("🔔 Alert Rules")
    st.caption("Create rules that fire when specific on-chain conditions are met.")

    # Stats
    conn = get_conn()
    n_rules  = conn.execute("SELECT COUNT(*) FROM alert_rules WHERE active=TRUE").fetchone()[0]
    n_fired  = conn.execute("SELECT COUNT(*) FROM alerts_fired").fetchone()[0]
    conn.close()

    c1, c2 = st.columns(2)
    c1.metric("Active Rules", n_rules)
    c2.metric("Total Alerts Fired", n_fired)

    tab_active, tab_add, tab_fired = st.tabs(["📋 Active Rules", "➕ Add Rule", "🔥 Fired Alerts"])

    with tab_active:
        rules = list_alert_rules()
        if rules:
            st.dataframe(pd.DataFrame(rules), use_container_width=True, hide_index=True)
        else:
            st.info("No active rules. Add one in the **Add Rule** tab.")

    with tab_add:
        with st.form("add_rule"):
            col1, col2 = st.columns(2)
            wallet     = col1.text_input("Wallet to watch", placeholder="0x...")
            chain      = col2.selectbox("Chain", CHAINS)
            alert_type = st.selectbox("Alert Type", [
                "threshold", "cex_deposit", "new_counterparty"
            ], help=(
                "**threshold** — fires when transfer ≥ amount\n\n"
                "**cex_deposit** — fires when wallet sends to a known exchange\n\n"
                "**new_counterparty** — fires on first-time interaction with an address"
            ))
            threshold = st.number_input("Amount threshold", value=10.0, min_value=0.0)
            submitted = st.form_submit_button("➕ Add Rule", use_container_width=True)

        if submitted and wallet:
            rule_id = add_alert_rule(wallet, chain, alert_type, threshold)
            st.success(f"✅ Rule #{rule_id} created — watching `{wallet[:12]}...` on {chain}")

    with tab_fired:
        conn = get_conn()
        try:
            fired = conn.execute(
                "SELECT * FROM alerts_fired ORDER BY fired_at DESC LIMIT 100"
            ).fetchdf()
        finally:
            conn.close()

        if not fired.empty:
            st.metric("Recent alerts", len(fired))
            st.dataframe(fired, use_container_width=True, hide_index=True, height=400)
        else:
            st.info("No alerts fired yet. Start the monitor with:\n```\npython scripts/monitor.py 0xYourWallet ethereum\n```")


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: Chain Trends (Alchemy)
# ══════════════════════════════════════════════════════════════════════════════

elif page == "📡 Chain Trends (Alchemy)":
    st.title("📡 Chain Trends")
    st.caption("Query transfers across the **entire blockchain** — not just investigated wallets. Powered by Alchemy.")

    tab_threshold, tab_wallet = st.tabs(["📊 Threshold Analysis", "🔍 Wallet Transfer History"])

    with tab_threshold:
        st.subheader("How many wallets sent X or more ETH?")
        col1, col2, col3 = st.columns(3)
        chain_t   = col1.selectbox("Chain", ["ethereum","base","arbitrum","polygon","optimism"], key="trend_chain")
        min_eth   = col2.number_input("Min value (ETH)", value=10.0, min_value=0.001, step=1.0)
        max_txs   = col3.number_input("Max transfers to scan", value=500, min_value=100, max_value=1000, step=100)

        if st.button("🔎 Run Analysis", use_container_width=True, type="primary"):
            with st.spinner(f"Scanning for transfers ≥ {min_eth} ETH on {chain_t}..."):
                result = _run(count_wallets_by_threshold(chain_t, min_eth=min_eth, max_count=int(max_txs)))

            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Transfers Found",    f"{result['transfers']:,}")
            c2.metric("Unique Senders",     f"{result['unique_senders']:,}")
            c3.metric("Unique Receivers",   f"{result['unique_receivers']:,}")
            c4.metric("Total Volume (ETH)", f"{result['total_volume']:,.2f}")

            if result["transfers_raw"]:
                df = pd.DataFrame(result["transfers_raw"])
                df["block_time"] = pd.to_datetime(df["block_time"])

                col_a, col_b = st.columns(2)
                with col_a:
                    st.subheader("Transfer Timeline")
                    timeline = df.set_index("block_time").resample("D")["value"].sum().reset_index()
                    fig = px.area(timeline, x="block_time", y="value",
                                  labels={"block_time": "Date", "value": f"ETH Transferred"},
                                  template="plotly_dark", color_discrete_sequence=["#818cf8"])
                    fig.update_layout(height=280, paper_bgcolor="rgba(0,0,0,0)",
                                      plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                    st.plotly_chart(fig, use_container_width=True)

                with col_b:
                    st.subheader("Top Senders by Volume")
                    top_senders = (df.groupby("from_address")["value"]
                                   .sum().sort_values(ascending=False).head(10).reset_index())
                    top_senders["from_address"] = top_senders["from_address"].str[:12] + "..."
                    fig = px.bar(top_senders, x="value", y="from_address", orientation="h",
                                 template="plotly_dark", color_discrete_sequence=["#f97316"])
                    fig.update_layout(height=280, paper_bgcolor="rgba(0,0,0,0)",
                                      plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                    st.plotly_chart(fig, use_container_width=True)

                saved = store_alchemy_transfers(result["transfers_raw"])
                st.caption(f"✅ {saved} transfers saved to DuckDB")
                st.subheader("All Transfers")
                st.dataframe(df[["block_time","from_address","to_address","value","asset","category","tx_hash"]],
                             use_container_width=True, hide_index=True, height=350)

    with tab_wallet:
        st.subheader("Full transfer history for any wallet (chain-wide)")
        col1, col2, col3 = st.columns(3)
        wallet_t  = col1.text_input("Wallet Address", placeholder="0x...", key="alchemy_wallet")
        chain_w   = col2.selectbox("Chain", ["ethereum","base","arbitrum","polygon","optimism"], key="alchemy_chain")
        direction = col3.radio("Direction", ["Sent (from)", "Received (to)", "Both"], horizontal=True)

        if st.button("📡 Fetch Transfers", use_container_width=True, type="primary") and wallet_t:
            with st.spinner("Fetching from Alchemy..."):
                from_addr = wallet_t if direction != "Received (to)" else None
                to_addr   = wallet_t if direction != "Sent (from)"   else None
                transfers = _run(get_asset_transfers(
                    chain=chain_w, from_address=from_addr, to_address=to_addr, max_count=500
                ))

            st.metric("Transfers found", len(transfers))
            if transfers:
                df = pd.DataFrame(transfers)
                df["block_time"] = pd.to_datetime(df["block_time"])

                col_a, col_b = st.columns(2)
                with col_a:
                    asset_vol = df.groupby("asset")["value"].sum().sort_values(ascending=False).head(10).reset_index()
                    fig = px.bar(asset_vol, x="asset", y="value", color="asset",
                                 template="plotly_dark", title="Volume by Asset")
                    fig.update_layout(height=280, showlegend=False,
                                      paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)")
                    st.plotly_chart(fig, use_container_width=True)
                with col_b:
                    cat_counts = df["category"].value_counts().reset_index()
                    cat_counts.columns = ["Category", "Count"]
                    fig = px.pie(cat_counts, names="Category", values="Count",
                                 template="plotly_dark", hole=0.4, title="Transfer Types")
                    fig.update_layout(height=280, paper_bgcolor="rgba(0,0,0,0)")
                    st.plotly_chart(fig, use_container_width=True)

                store_alchemy_transfers(transfers)
                st.dataframe(df[["block_time","from_address","to_address","value","asset","category","tx_hash"]],
                             use_container_width=True, hide_index=True, height=400)
            else:
                st.info("No transfers found.")


# ══════════════════════════════════════════════════════════════════════════════
# PAGE: DeFi Explorer (The Graph)
# ══════════════════════════════════════════════════════════════════════════════

elif page == "🦄 DeFi Explorer (The Graph)":
    st.title("🦄 DeFi Explorer")
    st.caption("Real Uniswap V3 and Aave V3 data via The Graph decentralized network.")

    tab_wallet, tab_global = st.tabs(["👤 Wallet DeFi", "🌐 Chain-Wide Swaps"])

    with tab_wallet:
        wallet = st.text_input("Wallet Address", placeholder="0x...", key="graph_wallet")
        if st.button("🔍 Fetch DeFi Activity", use_container_width=True, type="primary") and wallet:
            with st.spinner("Querying The Graph..."):
                swaps, lending = _run(asyncio.gather(
                    get_uniswap_swaps(wallet),
                    get_aave_activity(wallet),
                ))

            tab_u, tab_a = st.tabs([f"🦄 Uniswap ({len(swaps)})", f"🏛️ Aave ({len(lending)})"])

            with tab_u:
                if swaps:
                    store_swaps(swaps)
                    df = pd.DataFrame(swaps)
                    df["block_time"] = pd.to_datetime(df["block_time"])

                    c1, c2, c3 = st.columns(3)
                    c1.metric("Total Swaps",   len(df))
                    c2.metric("Total USD",     f"${df['amount_usd'].sum():,.0f}")
                    c3.metric("Avg Swap Size", f"${df['amount_usd'].mean():,.0f}")

                    col_a, col_b = st.columns(2)
                    with col_a:
                        timeline = df.set_index("block_time").resample("M")["amount_usd"].sum().reset_index()
                        fig = px.bar(timeline, x="block_time", y="amount_usd",
                                     labels={"block_time": "Month", "amount_usd": "USD Volume"},
                                     template="plotly_dark", color_discrete_sequence=["#f97316"])
                        fig.update_layout(height=260, paper_bgcolor="rgba(0,0,0,0)",
                                          plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                        st.plotly_chart(fig, use_container_width=True)
                    with col_b:
                        pairs = df.apply(lambda r: f"{r['token_in']}/{r['token_out']}", axis=1).value_counts().head(8).reset_index()
                        pairs.columns = ["Pair", "Count"]
                        fig = px.bar(pairs, x="Count", y="Pair", orientation="h",
                                     template="plotly_dark", color_discrete_sequence=["#818cf8"])
                        fig.update_layout(height=260, paper_bgcolor="rgba(0,0,0,0)",
                                          plot_bgcolor="rgba(0,0,0,0)", margin=dict(t=10))
                        st.plotly_chart(fig, use_container_width=True)

                    st.dataframe(df[["block_time","token_in","token_out","amount_in","amount_out","amount_usd","tx_hash"]],
                                 use_container_width=True, hide_index=True, height=350)
                else:
                    st.info("No Uniswap V3 swaps found.")

            with tab_a:
                if lending:
                    store_lending(lending)
                    df = pd.DataFrame(lending)
                    action_counts = df["action"].value_counts().reset_index()
                    action_counts.columns = ["Action","Count"]
                    fig = px.pie(action_counts, names="Action", values="Count",
                                 template="plotly_dark", hole=0.4,
                                 color_discrete_sequence=px.colors.qualitative.Set2)
                    fig.update_layout(height=300, paper_bgcolor="rgba(0,0,0,0)")
                    st.plotly_chart(fig, use_container_width=True)
                    st.dataframe(df, use_container_width=True, hide_index=True, height=300)
                else:
                    st.info("No Aave V3 activity found.")

    with tab_global:
        st.subheader("Largest Uniswap V3 swaps right now")
        col1, col2 = st.columns(2)
        min_usd = col1.number_input("Min swap size (USD)", value=100000, step=10000)
        limit   = col2.slider("Number of swaps", 10, 100, 50)

        if st.button("🌐 Fetch Live Swaps", use_container_width=True, type="primary"):
            with st.spinner("Querying The Graph..."):
                big_swaps = _run(get_global_swap_stats(min_usd=min_usd, limit=limit))

            if big_swaps:
                df = pd.DataFrame(big_swaps)
                df["block_time"] = pd.to_datetime(df["block_time"])

                c1, c2, c3 = st.columns(3)
                c1.metric("Swaps Found",   len(df))
                c2.metric("Total Volume",  f"${df['amount_usd'].sum():,.0f}")
                c3.metric("Largest Swap",  f"${df['amount_usd'].max():,.0f}")

                col_a, col_b = st.columns(2)
                with col_a:
                    pairs = df.apply(lambda r: f"{r['token_in']}/{r['token_out']}", axis=1).value_counts().head(10).reset_index()
                    pairs.columns = ["Pair", "Count"]
                    fig = px.bar(pairs, x="Count", y="Pair", orientation="h",
                                 template="plotly_dark", title="Most traded pairs",
                                 color_discrete_sequence=["#22c55e"])
                    fig.update_layout(height=300, paper_bgcolor="rgba(0,0,0,0)",
                                      plot_bgcolor="rgba(0,0,0,0)")
                    st.plotly_chart(fig, use_container_width=True)
                with col_b:
                    fig = px.histogram(df, x="amount_usd", nbins=20,
                                       template="plotly_dark", title="Swap size distribution",
                                       color_discrete_sequence=["#f97316"])
                    fig.update_layout(height=300, paper_bgcolor="rgba(0,0,0,0)",
                                      plot_bgcolor="rgba(0,0,0,0)")
                    st.plotly_chart(fig, use_container_width=True)

                st.dataframe(df[["block_time","wallet","token_in","token_out","amount_usd","tx_hash"]],
                             use_container_width=True, hide_index=True, height=400)
            else:
                st.info("No swaps found.")
