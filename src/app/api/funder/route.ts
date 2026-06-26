import { NextRequest, NextResponse } from "next/server";
import { getFirstFunder } from "@/lib/forensics/hops";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const chain = searchParams.get("chain") || "ethereum";

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet parameter" }, { status: 400 });
  }

  try {
    const result = await getFirstFunder(wallet, chain);
    if (!result) {
      return NextResponse.json({ error: "No funding transactions found for this address" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "An unexpected error occurred";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
