import { NextRequest, NextResponse } from "next/server";
import { isSanctioned, screenAddressList, countSanctioned } from "@/lib/forensics/sanctions";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    const total = await countSanctioned();
    return NextResponse.json({ count: total });
  }

  try {
    const sanctioned = await isSanctioned(wallet);
    return NextResponse.json({ wallet, sanctioned });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const addresses = body.addresses;
    if (!Array.isArray(addresses)) {
      return NextResponse.json({ error: "Missing or invalid addresses array in body" }, { status: 400 });
    }

    const hits = await screenAddressList(addresses);
    return NextResponse.json({
      total: addresses.length,
      hits: hits.length,
      sanctioned: hits,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
