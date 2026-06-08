import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { selectPastQuestions } from "@/services/questionSelector.service";

const schema = z.object({
  subjects: z.array(z.string()).min(1),
  examType: z.enum(["JAMB", "WAEC"]),
  mode: z.enum(["practice", "ExamMode"]),
  numberOfQuestions: z.number().int().min(1).max(100).optional(),
});

function shuffleQuestions<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export async function POST(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`past:${auth.userId}`).ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { subjects, examType, mode, numberOfQuestions } = parsed.data;

  let idCounter = 1;
  const questions = [];

  for (const subject of subjects) {
    const count =
      mode === "practice"
        ? numberOfQuestions || 20
        : examType === "JAMB"
        ? subject === "English"
          ? 60
          : 40
        : 50;

    const q = await selectPastQuestions({
      exam: examType,
      subject,
      count,
      startId: idCounter,
    });

    idCounter += q.length;
    questions.push(...q);
  }

  return NextResponse.json({
    questions: mode === "practice" ? shuffleQuestions(questions) : questions,
  });
}
