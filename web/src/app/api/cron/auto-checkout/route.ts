import { NextRequest, NextResponse } from "next/server";
import { autoCheckoutExpiredSessionsAction } from "@/actions/sessions";

// Call this endpoint from a cron job every minute:
// GET /api/cron/auto-checkout
// Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await autoCheckoutExpiredSessionsAction();
  return NextResponse.json({ success: true, checkedOut: result.count });
}
