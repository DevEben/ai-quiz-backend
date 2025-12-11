import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "AI Quiz Master is running",
    ts: Date.now(),
  });
}
