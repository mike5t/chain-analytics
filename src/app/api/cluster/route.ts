import { NextRequest, NextResponse } from "next/server";
import { runAllClustering } from "@/lib/forensics/cluster";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const addresses = body.addresses;
    const chain = body.chain || "ethereum";

    if (!Array.isArray(addresses)) {
      return NextResponse.json({ error: "Missing or invalid addresses array in body" }, { status: 400 });
    }

    const result = await runAllClustering(addresses, chain);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
