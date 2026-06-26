import { NextRequest, NextResponse } from "next/server";
import { getAllNativeBalances, getAllTokenBalances } from "@/lib/rpc";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const chain = searchParams.get("chain");
  const tokens = searchParams.get("tokens") === "true";

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet address parameter" }, { status: 400 });
  }

  try {
    if (tokens && chain) {
      const tokenBals = await getAllTokenBalances(wallet, chain);
      return NextResponse.json(tokenBals);
    } else {
      const nativeBals = await getAllNativeBalances(wallet);
      return NextResponse.json(nativeBals);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
