import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getCollection } from "@/lib/db";
import { issueToken } from "@/lib/auth";

const buildDefaultAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed || "User")}&backgroundColor=cdd6f4,e8e8e8&fontSize=36`;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const action = json?.action as "register" | "login" | undefined;

  if (action === "register") {
    const parsed = registerSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { email, password, name } = parsed.data;
    const users = await getCollection("users");

    const existing = await users.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const avatarUrl = buildDefaultAvatar(name || email);
    const user = {
      email,
      passwordHash,
      name,
      avatarUrl,
      createdAt: new Date(),
    };

    const result = await users.insertOne(user);
    const token = issueToken(result.insertedId.toString());
    return NextResponse.json({ token, user: { id: result.insertedId, email, name, avatarUrl } }, { status: 201 });
  }

  if (action === "login") {
    const parsed = loginSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const users = await getCollection("users");
    const user = await users.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, (user as any).passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const avatarUrl = (user as any).avatarUrl ?? buildDefaultAvatar((user as any).name || (user as any).email);
    if (!(user as any).avatarUrl) {
      await users.updateOne({ _id: (user as any)._id }, { $set: { avatarUrl } });
    }

    const token = issueToken((user as any)._id.toString());
    return NextResponse.json({
      token,
      user: { id: (user as any)._id, email: user.email, name: user.name, avatarUrl },
    });
  }

  return NextResponse.json({ error: "Unknown action. Use 'register' or 'login'" }, { status: 400 });
}

