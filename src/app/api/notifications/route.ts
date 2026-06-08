import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getCollection } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = await getCollection("notifications");
  const rows = await notifications
    .find({ userId: auth.userId, channel: "in_app" })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  const unreadCount = rows.filter((row: any) => row.status !== "read").length;

  return NextResponse.json({
    unreadCount,
    notifications: rows.map((row: any) => ({
      ...row,
      id: row._id,
      _id: undefined,
    })),
  });
}

export async function PATCH(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = await getCollection("notifications");
  const result = await notifications.updateMany(
    { userId: auth.userId, channel: "in_app", status: { $ne: "read" } },
    { $set: { status: "read", readAt: new Date() } }
  );

  return NextResponse.json({ updated: result.modifiedCount });
}

