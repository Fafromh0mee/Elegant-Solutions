import { NextRequest, NextResponse } from "next/server";
import { verifyGateAccessAction } from "@/actions/access-tokens";

export async function POST(req: NextRequest) {
  try {
    const { token, roomCode } = await req.json();

    if (!token || !roomCode) {
      return NextResponse.json(
        { error: "Missing token or roomCode" },
        { status: 400 }
      );
    }

    const result = await verifyGateAccessAction(token, roomCode);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Gate verify error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
