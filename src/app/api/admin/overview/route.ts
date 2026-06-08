import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getCollection } from "@/lib/db";
import { connectMongoose } from "@/lib/mongoose";
import { ImportJob } from "@/models/ImportJob";
import { PastQuestion } from "@/models/PastQuestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { response } = requireAdmin(req);
  if (response) return response;

  const users = await getCollection("users");
  const attempts = await getCollection("attempts");

  await connectMongoose();

  const [
    totalUsers,
    activeUsers,
    inactiveUsers,
    admins,
    attemptSummary,
    totalPastQuestions,
    activeImportJobs,
    failedImportJobs,
    recentUsers,
    recentJobs,
  ] = await Promise.all([
    users.countDocuments({}),
    users.countDocuments({ status: { $ne: "inactive" } }),
    users.countDocuments({ status: "inactive" }),
    users.countDocuments({ role: "admin" }),
    attempts
      .aggregate([
        {
          $group: {
            _id: null,
            totalAttempts: { $sum: 1 },
            averageScore: { $avg: "$scorePercent" },
            questionsAnswered: { $sum: "$totalQuestions" },
          },
        },
      ])
      .toArray(),
    PastQuestion.countDocuments({}),
    ImportJob.countDocuments({ status: { $in: ["queued", "processing"] } }),
    ImportJob.countDocuments({ status: "failed" }),
    users
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray(),
    ImportJob.find({}).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  const summary = attemptSummary[0] ?? {
    totalAttempts: 0,
    averageScore: 0,
    questionsAnswered: 0,
  };

  return NextResponse.json({
    stats: {
      totalUsers,
      activeUsers,
      inactiveUsers,
      admins,
      totalAttempts: summary.totalAttempts ?? 0,
      averageScore: summary.averageScore ?? 0,
      questionsAnswered: summary.questionsAnswered ?? 0,
      totalPastQuestions,
      activeImportJobs,
      failedImportJobs,
    },
    recentUsers: recentUsers.map((user: any) => ({
      ...user,
      id: user._id,
      _id: undefined,
      status: user.status ?? "active",
    })),
    recentJobs: recentJobs.map((job: any) => ({
      ...job,
      id: job._id,
      _id: undefined,
    })),
  });
}

