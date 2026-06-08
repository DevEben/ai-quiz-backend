import { z } from "zod";
import { NormalizedPastQuestion } from "@/interfaces/pastQuestion.interface";

const answerSchema = z.enum(["A", "B", "C", "D"]);

const rawAiQuestionSchema = z.object({
  year: z.number().int().min(1970).max(2100),
  questionNumber: z.number().int().positive().optional(),
  question: z.string().optional().default(""),
  options: z.object({
    A: z.string().optional().default(""),
    B: z.string().optional().default(""),
    C: z.string().optional().default(""),
    D: z.string().optional().default(""),
  }),
  correctAnswer: answerSchema,
  instruction: z.string().optional(),
  passage: z.string().optional(),
  visual: z
    .object({
      imageUrl: z.string().optional(),
      imagePublicId: z.string().optional(),
      description: z.string().optional(),
      label: z.string().optional(),
      pageNumber: z.number().int().positive().optional(),
    })
    .optional(),
  contextLabel: z.string().optional(),
  contextAppliesTo: z
    .object({
      startQuestionNumber: z.number().int().positive().optional(),
      endQuestionNumber: z.number().int().positive().optional(),
    })
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
  reviewFlags: z.array(z.string()).optional(),
});

type RawAiQuestion = z.infer<typeof rawAiQuestionSchema>;

const rawAiResponseSchema = z.object({
  questions: z.array(rawAiQuestionSchema),
});

const responseSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          year: { type: "integer" },
          questionNumber: { type: "integer" },
          question: { type: "string" },
          options: {
            type: "object",
            properties: {
              A: { type: "string" },
              B: { type: "string" },
              C: { type: "string" },
              D: { type: "string" },
            },
            required: ["A", "B", "C", "D"],
          },
          correctAnswer: { type: "string", enum: ["A", "B", "C", "D"] },
          instruction: { type: "string" },
          passage: { type: "string" },
          visual: {
            type: "object",
            properties: {
              imageUrl: { type: "string" },
              imagePublicId: { type: "string" },
              description: { type: "string" },
              label: { type: "string" },
              pageNumber: { type: "integer" },
            },
          },
          contextLabel: { type: "string" },
          contextAppliesTo: {
            type: "object",
            properties: {
              startQuestionNumber: { type: "integer" },
              endQuestionNumber: { type: "integer" },
            },
          },
          confidence: { type: "number" },
          reviewFlags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["year", "question", "options", "correctAnswer"],
      },
    },
  },
  required: ["questions"],
};

export type AiExtractionResult = {
  questions: NormalizedPastQuestion[];
  skipped: Array<{ year?: number; questionNumber?: number; reason: string }>;
  detectedYears: number[];
};

function cleanJson(text: string) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0] : cleaned.trim();
}

function parseGeminiJson(content: string) {
  const cleaned = cleanJson(content);

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const questionsStart = cleaned.indexOf('"questions"');
    const arrayStart = cleaned.indexOf("[", questionsStart);
    if (questionsStart === -1 || arrayStart === -1) throw error;

    const objects: unknown[] = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let objectStart = -1;

    for (let index = arrayStart + 1; index < cleaned.length; index++) {
      const char = cleaned[index];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === "{") {
        if (depth === 0) objectStart = index;
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0 && objectStart !== -1) {
          try {
            objects.push(JSON.parse(cleaned.slice(objectStart, index + 1)));
          } catch {
            // Ignore malformed trailing/embedded object.
          }
          objectStart = -1;
        }
      }
    }

    if (objects.length === 0) throw error;
    console.warn("Recovered partial Gemini JSON response", {
      recoveredQuestions: objects.length,
      originalError: error instanceof Error ? error.message : String(error),
    });
    return { questions: objects };
  }
}

function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  return {
    apiKey,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
  };
}

function detectYears(text: string) {
  const years = new Set<number>();
  const patterns = [
    /\b(?:UTME|JAMB|WAEC)\s+((?:19|20)\d{2})\b/gi,
    /\b((?:19|20)\d{2})\s+(?:USE OF ENGLISH|ENGLISH|BIOLOGY|MATHEMATICS|PHYSICS|CHEMISTRY)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const year = Number(match[1]);
      if (year >= 1970 && year <= new Date().getFullYear() + 1) years.add(year);
    }
  }

  return [...years].sort((a, b) => a - b);
}

function extractYearText(text: string, year: number, allYears: number[]) {
  const startPattern = new RegExp(`\\b(?:UTME|JAMB|WAEC)?\\s*${year}\\b[\\s\\S]*?(?:QUESTIONS|PAPER TYPE|PASSAGE|COMPREHENSION)`, "i");
  const startMatch = text.match(startPattern);
  if (!startMatch || startMatch.index === undefined) return text.slice(0, 120000);

  const start = startMatch.index;
  const laterYears = allYears.filter((item) => item > year);
  let end = text.length;

  for (const nextYear of laterYears) {
    const nextMatch = text.slice(start + 20).match(new RegExp(`\\b(?:UTME|JAMB|WAEC)?\\s*${nextYear}\\b`, "i"));
    if (nextMatch?.index !== undefined) {
      end = Math.min(end, start + 20 + nextMatch.index);
      break;
    }
  }

  return text.slice(start, end).slice(0, 120000);
}

async function generateStructuredQuestions({
  prompt,
  pdfBuffer,
}: {
  prompt: string;
  pdfBuffer: Buffer;
}) {
  const { apiKey, model } = getGeminiConfig();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pdfBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.05,
          maxOutputTokens: 32768,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Gemini extraction failed (${response.status}): ${details}`);
  }

  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("");

  if (!content) throw new Error("Gemini returned no extractable content");

  const parsedJson = parseGeminiJson(content);
  return rawAiResponseSchema.parse(parsedJson);
}

function normalizeQuestion({
  raw,
  exam,
  subject,
  importBatchId,
}: {
  raw: RawAiQuestion;
  exam: "JAMB" | "WAEC";
  subject: string;
  importBatchId: string;
}): { question?: NormalizedPastQuestion; skipped?: { year?: number; questionNumber?: number; reason: string } } {
  const question = raw.question.trim();
  const options = {
    A: raw.options.A.trim(),
    B: raw.options.B.trim(),
    C: raw.options.C.trim(),
    D: raw.options.D.trim(),
  };
  const reviewFlags = [...(raw.reviewFlags || [])];

  if (question.length < 2) {
    return {
      skipped: {
        year: raw.year,
        questionNumber: raw.questionNumber,
        reason: "Question text is missing",
      },
    };
  }

  for (const [key, value] of Object.entries(options)) {
    if (!value) {
      return {
        skipped: {
          year: raw.year,
          questionNumber: raw.questionNumber,
          reason: `Option ${key} is missing`,
        },
      };
    }
  }

  if ((raw.passage || raw.instruction || raw.visual?.description) && !raw.contextLabel) {
    reviewFlags.push("context_without_label");
  }
  if ((raw.confidence ?? 1) < 0.7) {
    reviewFlags.push("low_confidence");
  }

  return {
    question: {
      exam,
      subject,
      year: raw.year,
      questionNumber: raw.questionNumber,
      question,
      options,
      correctAnswer: raw.correctAnswer,
      instruction: raw.instruction?.trim() || undefined,
      passage: raw.passage?.trim() || undefined,
      visual: raw.visual
        ? {
            imageUrl: raw.visual.imageUrl?.trim() || undefined,
            imagePublicId: raw.visual.imagePublicId?.trim() || undefined,
            description: raw.visual.description?.trim() || undefined,
            label: raw.visual.label?.trim() || undefined,
            pageNumber: raw.visual.pageNumber,
          }
        : undefined,
      contextLabel: raw.contextLabel?.trim() || undefined,
      contextAppliesTo: raw.contextAppliesTo,
      importBatchId,
      extractionSource: "AI",
      confidence: raw.confidence,
      reviewFlags,
      source: "PAST_QUESTION",
    },
  };
}

async function extractYearQuestions({
  pdfBuffer,
  text,
  exam,
  subject,
  importBatchId,
  year,
  allYears,
}: {
  pdfBuffer: Buffer;
  text: string;
  exam: "JAMB" | "WAEC";
  subject: string;
  importBatchId: string;
  year: number;
  allYears: number[];
}) {
  const yearText = extractYearText(text, year, allYears);
  const prompt = `You are an expert Nigerian exam parser and examiner.

Extract ONLY objective ${exam} ${subject} questions for year ${year} from the attached PDF.

Return one JSON object with a questions array. Each item must be one actual question students can answer.

Rules:
- Include only year ${year}.
- Do not include theory questions.
- Preserve question text, four options A-D, and correctAnswer.
- Do not include options inside "question"; put A-D only in "options".
- Use answer keys in the PDF when present.
- Preserve visible emphasis using Markdown, for example italic words as *word* and bold words as **word**.
- If only some letters in a word are underlined/emphasized, preserve that emphasis around those letters where possible.
- For comprehension/literature/cloze/oral-English passages, put the passage in "passage"; do not bury it inside "question".
- Do not include cloze answer choices from other gaps inside "passage"; each question gets only its own A-D options.
- For section instructions like "In each of questions 86 to 88..." put that text in "instruction" and set contextAppliesTo.
- For diagrams/images/tables/graphs/maps, include visual.description, visual.label, and visual.pageNumber if visible.
- If one context applies to multiple questions, repeat it on each affected question and use the same contextLabel.
- Set confidence from 0 to 1. Add reviewFlags for uncertain answers, missing visual crop, unclear option, or inferred context.
- Return valid JSON only.

Extracted text for year ${year}:
${yearText}`;

  const parsed = await generateStructuredQuestions({ prompt, pdfBuffer });
  const questions: NormalizedPastQuestion[] = [];
  const skipped: AiExtractionResult["skipped"] = [];

  parsed.questions.forEach((raw) => {
    const normalized = normalizeQuestion({ raw, exam, subject, importBatchId });
    if (normalized.question) questions.push(normalized.question);
    if (normalized.skipped) skipped.push(normalized.skipped);
  });

  return { questions, skipped };
}

export async function extractPastQuestionsAiFirst({
  text,
  pdfBuffer,
  exam,
  subject,
  importBatchId,
}: {
  text: string;
  pdfBuffer: Buffer;
  exam: "JAMB" | "WAEC";
  subject: string;
  importBatchId: string;
}): Promise<AiExtractionResult> {
  const detectedYears = detectYears(text);
  const yearsToProcess = detectedYears.length > 0 ? detectedYears : [new Date().getFullYear()];
  const questions: NormalizedPastQuestion[] = [];
  const skipped: AiExtractionResult["skipped"] = [];

  for (const year of yearsToProcess) {
    try {
      const result = await extractYearQuestions({
        pdfBuffer,
        text,
        exam,
        subject,
        importBatchId,
        year,
        allYears: yearsToProcess,
      });
      questions.push(...result.questions);
      skipped.push(...result.skipped);
    } catch (error) {
      skipped.push({
        year,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (questions.length === 0) {
    throw new Error("AI extraction returned no valid questions");
  }

  return {
    questions: questions.sort((a, b) => a.year - b.year || (a.questionNumber || 0) - (b.questionNumber || 0)),
    skipped,
    detectedYears: yearsToProcess,
  };
}
