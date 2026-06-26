import { NextRequest, NextResponse } from "next/server";
import { traceHops, summariseHopGraph } from "@/lib/forensics/hops";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const chain = searchParams.get("chain") || "ethereum";
  const hops = parseInt(searchParams.get("max_hops") || "3");
  const minAmount = parseFloat(searchParams.get("min_amount") || "0.1");

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  try {
    const result = await traceHops(wallet, chain, hops, minAmount);
    const summary = summariseHopGraph(result.graph);
    
    // Get top 20 destinations
    const topDestinations: Record<string, any> = {};
    Object.entries(summary).slice(0, 20).forEach(([addr, info]) => {
      topDestinations[addr] = info;
    });

    return NextResponse.json({
      start: wallet,
      chain,
      hops,
      addresses_found: result.addresses_found.length,
      edge_count: result.graph.length,
      top_destinations: topDestinations,
      graph: result.graph,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
