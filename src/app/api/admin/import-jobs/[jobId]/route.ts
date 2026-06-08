import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectMongoose } from "@/lib/mongoose";
import { ImportJob } from "@/models/ImportJob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth || auth.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongoose();

  const { jobId } = await params;
  const job = await ImportJob.findById(jobId).lean();

  if (!job) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }

  return NextResponse.json({
    job: {
      ...(job as any),
      id: (job as any)._id,
      _id: undefined,
    },
  });
}
