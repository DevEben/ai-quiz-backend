import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectMongoose } from "@/lib/mongoose";
import { ImportJob } from "@/models/ImportJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth || auth.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongoose();

  const jobs = await ImportJob.find({})
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return NextResponse.json({
    jobs: jobs.map((job: any) => ({
      ...job,
      id: job._id,
      _id: undefined,
    })),
  });
}
