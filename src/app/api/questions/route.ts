// import { NextResponse } from "next/server";
// import { z } from "zod";
// import { verifyAuth } from "@/lib/auth";
// import { rateLimit } from "@/lib/rate-limit";

// const bodySchema = z.object({
//   subject: z.string().min(1),
//   examType: z.string().min(1),
//   numberOfQuestions: z.number().int().min(1).max(100),
// });

// export async function POST(req: Request) {
//   console.log("Headers: ", req.headers.get("authorization") || undefined);
//   const auth = verifyAuth(req.headers.get("authorization") || undefined);
//   console.log("Auth: ", auth);
//   if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//   const key = `questions:${auth.userId}`;
//   if (!rateLimit(key).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

//   const json = await req.json();
//   const parsed = bodySchema.safeParse(json);
//   if (!parsed.success) {
//     return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
//   }

//   const { subject, examType, numberOfQuestions } = parsed.data;

//   const systemPrompt = `You are an expert exam question generator for Nigerian ${examType} examinations. Generate exactly ${numberOfQuestions} multiple choice questions for the subject: ${subject}.

// Each question must:
// 1. Be appropriate for ${examType} standard
// 2. Have exactly 4 options (A, B, C, D)
// 3. Have only ONE correct answer
// 4. Cover different topics within the subject
// 5. Be clear and unambiguous

// Return ONLY a valid JSON array with this exact structure (no markdown, no code blocks):
// [
//   {
//     "question": "The question text here?",
//     "options": ["Option A", "Option B", "Option C", "Option D"],
//     "correctAnswer": 0
//   }
// ]

// Where correctAnswer is the index (0-3) of the correct option.
// Generate exactly ${numberOfQuestions} questions.`;

//   try {
//     const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
//       method: "POST",
//       headers: {
//         Authorization: `Bearer ${process.env.AI_GATEWAY_KEY}`,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         model: "google/gemini-2.5-flash",
//         messages: [
//           { role: "system", content: systemPrompt },
//           { role: "user", content: `Generate ${numberOfQuestions} ${examType} ${subject} questions now.` },
//         ],
//         temperature: 0.7,
//       }),
//     });

//     console.log("AI response: ", resp)

//     if (!resp.ok) {
//       const text = await resp.text();
//       return NextResponse.json({ error: "AI gateway error", status: resp.status, details: text }, { status: 502 });
//     }

//     const data = await resp.json();
//     let content: string = data?.choices?.[0]?.message?.content;
//     if (!content) return NextResponse.json({ error: "No content from AI" }, { status: 502 });

//     let cleaned = content.trim();
//     if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
//     else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
//     if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
//     cleaned = cleaned.trim();

//     const questions = JSON.parse(cleaned);
//     if (!Array.isArray(questions) || questions.length === 0) {
//       return NextResponse.json({ error: "Invalid questions format" }, { status: 502 });
//     }

//     const validated = questions.map((q: any, idx: number) => ({
//       id: idx + 1,
//       question: q.question,
//       options: q.options,
//       correctAnswer: typeof q.correctAnswer === "number" ? q.correctAnswer : 0,
//     }));

//     return NextResponse.json({ questions: validated });
//   } catch (err: any) {
//     return NextResponse.json({ error: err?.message ?? "Failed to generate questions" }, { status: 500 });
//   }
// }



import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  subject: z.string().min(1),
  examType: z.string().min(1),
  numberOfQuestions: z.number().int().min(1).max(100),
});

export async function POST(req: Request) {
  console.log("Headers: ", req.headers.get("authorization") || undefined);
  const auth = verifyAuth(req.headers.get("authorization") || undefined);
  console.log("Auth: ", auth);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = `questions:${auth.userId}`;
  if (!rateLimit(key).ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { subject, examType, numberOfQuestions } = parsed.data;

  // Enhanced prompt for Nigerian exam standards
  const systemPrompt = `You are an expert exam question generator specializing in Nigerian ${examType} examinations. You have deep knowledge of the West African Examinations Council (WAEC) and Joint Admissions and Matriculation Board (JAMB) syllabi and examination patterns.

Generate exactly ${numberOfQuestions} multiple choice questions for ${subject} that match the actual ${examType} standard and difficulty level.

CRITICAL REQUIREMENTS:
1. Questions MUST reflect actual ${examType} ${subject} curriculum topics
2. Difficulty level MUST match typical ${examType} standards
3. Each question has exactly 4 options (A, B, C, D)
4. Only ONE option is correct
5. Distractors (wrong answers) should be plausible but clearly incorrect
6. Cover diverse topics within ${subject} to test comprehensive understanding
7. Use clear, unambiguous language appropriate for Nigerian students
8. For sciences: include practical applications and real-world contexts
9. For humanities: include Nigerian/African perspectives where relevant

Return ONLY a valid JSON array with this exact structure (no markdown, no code blocks, no additional text):
[
  {
    "question": "The question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0
  }
]

Where correctAnswer is the index (0-3) of the correct option.
Generate exactly ${numberOfQuestions} questions now.`;

  try {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    // Using Llama 3.3 70B - best free model for accuracy
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // Most accurate free model
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Generate ${numberOfQuestions} high-quality ${examType} ${subject} examination questions now. Ensure they match the actual exam standard used in Nigerian schools.` 
          }
        ],
        temperature: 0.7, // Balanced creativity and consistency
        max_tokens: 4096,
        top_p: 1,
        stream: false,
      }),
    });

    console.log("Groq response status: ", resp.status);

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Groq error:", text);
      
      // Handle specific Groq errors
      if (resp.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again in a few seconds." },
          { status: 429 }
        );
      }
      
      return NextResponse.json(
        { error: "AI API error", status: resp.status, details: text },
        { status: 502 }
      );
    }

    const data = await resp.json();
    
    // Standard OpenAI-compatible response format
    const content = data?.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error("No content from Groq:", data);
      return NextResponse.json({ error: "No content from AI" }, { status: 502 });
    }

    console.log("Raw AI response:", content.substring(0, 300));

    // Clean the response - remove markdown code blocks if present
    let cleaned = content.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    // Extract JSON array if there's extra text
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }

    const questions = JSON.parse(cleaned);
    if (!Array.isArray(questions) || questions.length === 0) {
      console.error("Invalid questions format:", questions);
      return NextResponse.json({ error: "Invalid questions format" }, { status: 502 });
    }

    // Validate and structure questions
    const validated = questions.map((q: any, idx: number) => {
      // Ensure options is an array of 4 items
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        console.warn(`Question ${idx + 1} has invalid options`);
        return null;
      }

      return {
        id: idx + 1,
        question: q.question,
        options: q.options,
        correctAnswer: typeof q.correctAnswer === "number" ? q.correctAnswer : 0,
      };
    }).filter(Boolean); // Remove any null entries

    if (validated.length === 0) {
      return NextResponse.json({ error: "No valid questions generated" }, { status: 502 });
    }

    console.log(`Successfully generated ${validated.length} questions for ${examType} ${subject}`);

    return NextResponse.json({ questions: validated });
  } catch (err: any) {
    console.error("Error generating questions:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to generate questions" },
      { status: 500 }
    );
  }
}