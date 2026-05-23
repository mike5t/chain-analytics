"""
Snapshot.org API — on-chain governance voting history.

Snapshot is a free, gasless voting platform used by most DeFi protocols.
No API key required.
"""

import httpx

SNAPSHOT_API = "https://hub.snapshot.org/graphql"


async def _query(q: str, variables: dict | None = None) -> dict:
    payload: dict = {"query": q}
    if variables:
        payload["variables"] = variables
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(SNAPSHOT_API, json=payload)
        r.raise_for_status()
        return r.json().get("data", {})


async def get_votes(wallet: str, limit: int = 100) -> list[dict]:
    """Return all governance votes cast by a wallet across all Snapshot spaces."""
    query = """
    query Votes($voter: String!, $first: Int!) {
      votes(where: {voter: $voter}, first: $first, orderBy: "created", orderDirection: desc) {
        id
        voter
        created
        choice
        proposal {
          id
          title
          space { id name }
          state
          start
          end
        }
      }
    }
    """
    data = await _query(query, {"voter": wallet, "first": limit})
    votes = []
    for v in data.get("votes", []):
        votes.append({
            "vote_id":        v["id"],
            "voter":          v["voter"],
            "created":        v["created"],
            "choice":         v["choice"],
            "proposal_id":    v["proposal"]["id"],
            "proposal_title": v["proposal"]["title"],
            "space_id":       v["proposal"]["space"]["id"],
            "space_name":     v["proposal"]["space"]["name"],
            "proposal_state": v["proposal"]["state"],
        })
    return votes


async def get_proposals(space: str, limit: int = 20) -> list[dict]:
    """Return recent proposals for a Snapshot governance space."""
    query = """
    query Proposals($space: String!, $first: Int!) {
      proposals(where: {space: $space}, first: $first, orderBy: "created", orderDirection: desc) {
        id
        title
        state
        votes
        scores_total
        start
        end
        author
      }
    }
    """
    data = await _query(query, {"space": space, "first": limit})
    return data.get("proposals", [])


async def get_wallet_spaces(wallet: str) -> list[str]:
    """Return all Snapshot spaces a wallet has voted in."""
    votes = await get_votes(wallet, limit=500)
    return list({v["space_id"] for v in votes})
