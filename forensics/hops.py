"""
Multi-hop money tracing.

BFS traversal: starting from an address, follow outflows N hops deep.
Each hop investigates a new address via Etherscan and stores flows to DuckDB.
"""

import asyncio
from collections import defaultdict
from indexer.etherscan import investigate_address
from db.database import store_flows


async def trace_hops(
    start_address: str,
    chain: str,
    max_hops: int = 3,
    min_amount: float = 0.1,
) -> dict:
    """
    Follow money from start_address up to max_hops deep.

    Example tree:
        Hop 1: start → A, start → B
        Hop 2: A → C, A → D, B → E
        Hop 3: C → F, D → G

    Args:
        start_address: Ethereum address to start from.
        chain:         Chain name (must be in config/chains.py).
        max_hops:      Maximum depth to traverse.
        min_amount:    Skip edges with amount below this threshold.

    Returns:
        dict with graph edges and all addresses found.
    """
    visited: set[str] = set()
    graph:   list[dict] = []
    queue:   list[tuple[str, int]] = [(start_address.lower(), 0)]

    while queue:
        address, hop = queue.pop(0)
        if address in visited or hop >= max_hops:
            continue
        visited.add(address)

        print(f"  Hop {hop + 1}: investigating {address}")
        try:
            data = await investigate_address(address, chain)
        except Exception as e:
            print(f"  [hops] error at {address}: {e}")
            continue

        stored = store_flows(data["all_flows"])
        print(f"  └─ stored {stored} flows")

        for flow in data["outflows"]:
            if flow["amount"] < min_amount:
                continue
            destination = flow["to_address"]
            graph.append({
                "source":      address,
                "destination": destination,
                "chain":       chain,
                "hop_number":  hop + 1,
                "token":       flow["token"],
                "amount":      flow["amount"],
                "tx_hash":     flow["tx_hash"],
            })
            if destination not in visited:
                queue.append((destination, hop + 1))

    return {
        "start":           start_address,
        "chain":           chain,
        "hops":            max_hops,
        "graph":           graph,
        "addresses_found": list(visited),
    }


def summarise_hop_graph(graph: list[dict]) -> dict:
    """
    Aggregate the hop graph by destination address.

    Returns:
        Dict mapping address → {total_received, tx_count, tokens}
        sorted by total_received descending.
    """
    volume = defaultdict(float)
    count  = defaultdict(int)
    tokens: dict[str, set] = defaultdict(set)

    for edge in graph:
        dest = edge["destination"]
        volume[dest] += edge["amount"]
        count[dest]  += 1
        tokens[dest].add(edge["token"])

    return {
        addr: {
            "total_received": round(volume[addr], 6),
            "tx_count":       count[addr],
            "tokens":         list(tokens[addr]),
        }
        for addr in sorted(volume, key=lambda x: -volume[x])
    }


def build_networkx_graph(graph: list[dict]):
    """
    Convert the hop graph list into a NetworkX DiGraph for visualisation.
    Requires: pip install networkx
    """
    try:
        import networkx as nx
        G = nx.DiGraph()
        for edge in graph:
            G.add_edge(
                edge["source"],
                edge["destination"],
                weight=edge["amount"],
                token=edge["token"],
                hop=edge["hop_number"],
            )
        return G
    except ImportError:
        raise RuntimeError("networkx not installed — run: pip install networkx")
