import { NextRequest, NextResponse } from "next/server";
import { investigateAddress, investigateAllChains } from "@/lib/etherscan";
import { storeFlows } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const chain = searchParams.get("chain");

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  try {
    if (chain) {
      const data = await investigateAddress(wallet, chain);
      await storeFlows(data.all_flows);
      return NextResponse.json({
        wallet: data.wallet,
        chain,
        inflows: data.inflows.length,
        outflows: data.outflows.length,
        burns: data.burns.length,
        total: data.all_flows.length,
      });
    } else {
      const result = await investigateAllChains(wallet);
      const summary: Record<string, any> = {};
      for (const [ch, data] of Object.entries(result.chains)) {
        await storeFlows(data.all_flows);
        summary[ch] = {
          inflows: data.inflows.length,
          outflows: data.outflows.length,
          burns: data.burns.length,
          total: data.all_flows.length,
        };
      }
      return NextResponse.json({ wallet, chains: summary });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
