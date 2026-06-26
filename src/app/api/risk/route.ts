import { NextRequest, NextResponse } from "next/server";
import { scoreWallet } from "@/lib/forensics/risk";
import { storeRiskScore } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const chain = searchParams.get("chain") || "ethereum";

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  try {
    const result = await scoreWallet(wallet, chain);
    await storeRiskScore(result);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
