import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";

export function requireAdmin(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth || auth.role !== "admin") {
    return {
      auth: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { auth, response: null };
}

