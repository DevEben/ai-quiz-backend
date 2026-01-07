import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth";
import { getCollection } from "@/lib/db";

const profileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().optional(),
});

const buildDefaultAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed || "User")}&backgroundColor=cdd6f4,e8e8e8&fontSize=36`;

export async function GET(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await getCollection("users");
  const user = await users.findOne({ _id: new ObjectId(auth.userId) });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const avatarUrl = (user as any).avatarUrl ?? buildDefaultAvatar((user as any).name || (user as any).email);
  if (!(user as any).avatarUrl) {
    await users.updateOne({ _id: (user as any)._id }, { $set: { avatarUrl } });
  }

  return NextResponse.json({
    user: {
      id: (user as any)._id,
      email: (user as any).email,
      name: (user as any).name,
      avatarUrl,
    },
  });
}

export async function PUT(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, avatarUrl } = parsed.data;
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const users = await getCollection("users");
  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(auth.userId) },
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const user = result as any;
  return NextResponse.json({
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl ?? buildDefaultAvatar(user.name || user.email),
    },
  });
}

