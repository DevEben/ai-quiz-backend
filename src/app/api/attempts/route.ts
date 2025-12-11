import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth";
import { getCollection } from "@/lib/db";

const answerSchema = z.object({
  questionId: z.string(),
  selected: z.number().int(),
  correct: z.number().int(),
});

const bodySchema = z.object({
  examType: z.string().min(1),
  subject: z.string().min(1),
  totalQuestions: z.number().int().min(1),
  correctAnswers: z.number().int().min(0),
  scorePercent: z.number().min(0),
  answers: z.array(answerSchema).default([]),
  userName: z.string().optional(),
  userEmail: z.string().email().optional(),
});

export async function POST(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { examType, subject, totalQuestions, correctAnswers, scorePercent, answers, userName, userEmail } = parsed.data;

  try {
    const attempts = await getCollection("attempts");
    const doc = {
      userId: auth.userId,
      userName,
      userEmail,
      examType,
      subject,
      totalQuestions,
      correctAnswers,
      scorePercent,
      createdAt: new Date(),
      answers: answers.map((a) => ({
        questionId: a.questionId,
        selected: a.selected,
        correct: a.correct,
      })),
    };

    const result = await attempts.insertOne(doc);
    const attempt = { _id: result.insertedId, ...doc };

    return NextResponse.json({ attempt });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to save attempt" }, { status: 500 });
  }
}

