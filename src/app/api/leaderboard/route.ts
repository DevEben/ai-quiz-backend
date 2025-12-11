import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { getCollection } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject") || undefined;
  const limit = Number(searchParams.get("limit") || 50);

  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const attempts = await getCollection("attempts");
    const pipeline: any[] = [];
    if (subject) {
      pipeline.push({ $match: { subject } });
    }
    pipeline.push(
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$userId",
          average_score: { $avg: "$scorePercent" },
          quizzes_completed: { $sum: 1 },
          latest_userName: { $first: "$userName" },
          latest_userEmail: { $first: "$userEmail" },
        },
      },
      { $sort: { average_score: -1 } },
      { $limit: Math.min(limit, 100) }
    );

    const grouped = await attempts.aggregate(pipeline).toArray();

    const entries = grouped.map((g: any) => ({
      userId: g._id,
      userName: g.latest_userName || g.latest_userEmail || "Anonymous",
      average_score: g.average_score ?? 0,
      quizzes_completed: g.quizzes_completed ?? 0,
    }));

    type Entry = {
      userId: string;
      userName: string;
      average_score: number;
      quizzes_completed: number;
    };

    const ranked = entries
      .sort((a: Entry, b: Entry) => b.average_score - a.average_score)
      .map((e: Entry, idx: number) => ({ rank: idx + 1, ...e }));

    return NextResponse.json({ leaderboard: ranked });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
