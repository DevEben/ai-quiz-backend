import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { connectMongoose } from "@/lib/mongoose";
import { ImportJob } from "@/models/ImportJob";
import { startPastQuestionImportJob } from "@/services/pastQuestionImport.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = verifyAuth(req.headers.get("authorization") || undefined);
    if (!auth || auth.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectMongoose();

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const exam = String(formData.get("exam") || "").toUpperCase();
    const subject = String(formData.get("subject") || "").trim();
    const mode = String(formData.get("mode") || "ai") as "ai" | "parser";

    if (!file || !exam || !subject) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (exam !== "JAMB" && exam !== "WAEC") {
      return NextResponse.json({ error: "Exam must be JAMB or WAEC" }, { status: 400 });
    }

    if (mode !== "ai" && mode !== "parser") {
      return NextResponse.json({ error: "Mode must be ai or parser" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }

    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    const job = await ImportJob.create({
      status: "queued",
      exam,
      subject,
      mode,
      fileName: file.name,
      fileSize: file.size,
      createdBy: auth.userId,
      stage: "queued",
      progressMessage: "Waiting to start",
      logs: [
        {
          level: "info",
          message: "Import job queued",
          createdAt: new Date(),
        },
      ],
    });

    startPastQuestionImportJob({
      jobId: job._id.toString(),
      pdfBuffer,
      exam,
      subject,
      mode,
    });

    return NextResponse.json(
      {
        message: "Import job queued",
        job: {
          id: job._id,
          status: job.status,
          exam: job.exam,
          subject: job.subject,
          mode: job.mode,
          fileName: job.fileName,
          fileSize: job.fileSize,
          stage: job.stage,
          progressMessage: job.progressMessage,
          createdAt: job.createdAt,
        },
      },
      { status: 202 }
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message || "Failed to queue import job" },
      { status: 500 }
    );
  }
}
