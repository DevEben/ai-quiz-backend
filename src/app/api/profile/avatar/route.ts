import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { verifyAuth } from "@/lib/auth";
import { getCollection } from "@/lib/db";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export async function POST(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(new Uint8Array(arrayBuffer)).toString("base64");
  const mime = file.type || "application/octet-stream";
  const dataUrl = `data:${mime};base64,${base64}`;

  const users = await getCollection("users");
  const result = await users.findOneAndUpdate(
    { _id: new ObjectId(auth.userId) },
    { $set: { avatarUrl: dataUrl } },
    { returnDocument: "after" }
  );

  if (!result) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const user = result as any;
  return NextResponse.json({
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
  });
}

