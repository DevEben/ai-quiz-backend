import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { getCollection } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buildDefaultAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed || "User")}&backgroundColor=cdd6f4,e8e8e8&fontSize=36`;

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).optional(),
  avatarUrl: z.string().min(1).optional(),
  role: z.enum(["user", "admin"]).default("user"),
  status: z.enum(["active", "inactive"]).default("active"),
});

export async function GET(req: Request) {
  const { response } = requireAdmin(req);
  if (response) return response;

  const users = await getCollection("users");
  const attempts = await getCollection("attempts");

  const [rows, attemptRows] = await Promise.all([
    users
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    attempts
      .aggregate([
        {
          $group: {
            _id: "$userId",
            quizzesTaken: { $sum: 1 },
            averageScore: { $avg: "$scorePercent" },
            lastQuizAt: { $max: "$createdAt" },
          },
        },
      ])
      .toArray(),
  ]);

  const attemptMap = new Map(attemptRows.map((row: any) => [row._id, row]));

  return NextResponse.json({
    users: rows.map((user: any) => {
      const stats = attemptMap.get(user._id.toString());
      return {
        ...user,
        id: user._id,
        _id: undefined,
        status: user.status ?? "active",
        role: user.role ?? "user",
        quizzesTaken: stats?.quizzesTaken ?? 0,
        averageScore: stats?.averageScore ?? 0,
        lastQuizAt: stats?.lastQuizAt,
      };
    }),
  });
}

export async function POST(req: Request) {
  const { response } = requireAdmin(req);
  if (response) return response;

  const json = await req.json().catch(() => null);
  const parsed = createUserSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const users = await getCollection("users");
  const existing = await users.findOne({ email: parsed.data.email });
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const now = new Date();
  const doc = {
    email: parsed.data.email,
    passwordHash,
    name: parsed.data.name,
    avatarUrl: parsed.data.avatarUrl || buildDefaultAvatar(parsed.data.name || parsed.data.email),
    role: parsed.data.role,
    status: parsed.data.status,
    createdAt: now,
    updatedAt: now,
  };

  const result = await users.insertOne(doc);

  return NextResponse.json(
    {
      user: {
        ...doc,
        passwordHash: undefined,
        id: result.insertedId,
      },
    },
    { status: 201 }
  );
}
