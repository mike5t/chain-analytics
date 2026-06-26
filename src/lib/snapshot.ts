const SNAPSHOT_API = "https://hub.snapshot.org/graphql";

async function graphqlQuery(query: string, variables: Record<string, any> = {}): Promise<any> {
  const response = await fetch(SNAPSHOT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Snapshot API query failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Snapshot GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data || {};
}

export interface VoteRecord {
  vote_id: string;
  voter: string;
  created: number;
  choice: any;
  proposal_id: string;
  proposal_title: string;
  space_id: string;
  space_name: string;
  proposal_state: string;
}

export async function getVotes(wallet: string, limit = 100): Promise<VoteRecord[]> {
  const query = `
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
  `;

  try {
    const data = await graphqlQuery(query, { voter: wallet.toLowerCase(), first: limit });
    if (!data.votes || !Array.isArray(data.votes)) return [];

    return data.votes.map((v: any) => ({
      vote_id: v.id,
      voter: v.voter,
      created: v.created,
      choice: v.choice,
      proposal_id: v.proposal.id,
      proposal_title: v.proposal.title,
      space_id: v.proposal.space.id,
      space_name: v.proposal.space.name,
      proposal_state: v.proposal.state,
    }));
  } catch (e) {
    console.error("[snapshot] getVotes error:", e);
    return [];
  }
}

export async function getProposals(space: string, limit = 20): Promise<any[]> {
  const query = `
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
  `;

  try {
    const data = await graphqlQuery(query, { space, first: limit });
    return data.proposals || [];
  } catch (e) {
    console.error("[snapshot] getProposals error:", e);
    return [];
  }
}

export async function getWalletSpaces(wallet: string): Promise<string[]> {
  const votes = await getVotes(wallet, 500);
  const spaces = votes.map((v) => v.space_id);
  return Array.from(new Set(spaces));
}
