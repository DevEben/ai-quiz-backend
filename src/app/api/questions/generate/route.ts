import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { selectPastQuestions } from "@/services/questionSelector.service";

const schema = z.object({
  subjects: z.array(z.string()).min(1),
  examType: z.string().min(1),
  mode: z.enum(["practice", "ExamMode"]).default("practice"),
  numberOfQuestions: z.number().int().min(1).max(100).optional(),
  source: z.enum(["AI", "PAST_QUESTIONS", "HYBRID"]).default("HYBRID"),
});

export async function POST(req: Request) {
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = `generate:${auth.userId}`;
  if (!rateLimit(key).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { subjects, examType, mode, numberOfQuestions, source } = parsed.data;

  if (source === "AI") {
    // Redirect to AI generation
    const aiReq = new Request("http://localhost:3000/api/questions", {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({ subjects, examType, mode, numberOfQuestions }),
    });
    return fetch(aiReq);
  }

  if (source === "PAST_QUESTIONS") {
    // Redirect to past questions
    const pastReq = new Request("http://localhost:3000/api/questions/generate-past", {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({ subjects, examType, mode }),
    });
    return fetch(pastReq);
  }

  if (source === "HYBRID") {
    // 70% past + 30% AI
    const allQuestions = [];
    let idCounter = 1;

    for (const subject of subjects) {
      const totalCount = mode === "practice" ? (numberOfQuestions || 20) :
        examType === "JAMB" ? (subject === subjects[0] ? 60 : 40) : 50;

      const pastCount = Math.floor(totalCount * 0.7);
      const aiCount = totalCount - pastCount;

      // Get past questions
      const pastQuestions = await selectPastQuestions({
        exam: examType,
        subject,
        count: pastCount,
        startId: idCounter,
      });

      // Get AI questions
      const aiResponse = await fetch("http://localhost:3000/api/questions", {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify({
          subjects: [subject],
          examType,
          mode: "practice",
          numberOfQuestions: aiCount,
        }),
      });

      if (!aiResponse.ok) {
        return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
      }

      const aiData = await aiResponse.json();
      const aiQuestions = aiData.questions.map((q: any, idx: number) => ({
        ...q,
        id: idCounter + pastQuestions.length + idx,
      }));

      allQuestions.push(...pastQuestions, ...aiQuestions);
      idCounter += pastQuestions.length + aiQuestions.length;
    }

    return NextResponse.json({ questions: allQuestions });
  }

  return NextResponse.json({ error: "Invalid source" }, { status: 400 });
}
