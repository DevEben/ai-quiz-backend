import { randomUUID } from "crypto";
import { connectMongoose } from "@/lib/mongoose";
import { parseJambWaecQuestions } from "@/lib/parsePastQuestions";
import { ImportJobResult } from "@/interfaces/importJob.interface";
import { NormalizedPastQuestion } from "@/interfaces/pastQuestion.interface";
import { ImportJob } from "@/models/ImportJob";
import { PastQuestion } from "@/models/PastQuestion";
import { extractPastQuestionsAiFirst } from "./pastQuestionAi.service";
import { enrichQuestionsWithPdfContext } from "./questionContextEnrichment.service";
import { enrichQuestionVisuals } from "./questionVisual.service";

type ProcessImportInput = {
  jobId: string;
  pdfBuffer: Buffer;
  exam: "JAMB" | "WAEC";
  subject: string;
  mode: "ai" | "parser";
};

async function parsePdfText(buffer: Buffer) {
  const runtimeRequire = eval("require") as NodeRequire;
  const { PDFParse } = runtimeRequire("pdf-parse") as {
    PDFParse: new (options: { data: Buffer }) => {
      getText: () => Promise<{ text: string }>;
      destroy: () => Promise<void>;
    };
  };
  const parser = new PDFParse({ data: buffer });

  try {
    const pdfData = await parser.getText();
    return pdfData.text;
  } finally {
    await parser.destroy();
  }
}

function toParserFallbackQuestions({
  text,
  exam,
  subject,
  importBatchId,
}: {
  text: string;
  exam: "JAMB" | "WAEC";
  subject: string;
  importBatchId: string;
}): NormalizedPastQuestion[] {
  const years = [...text.matchAll(/\b(?:UTME|JAMB|WAEC)\s+((?:19|20)\d{2})\b/gi)]
    .map((match) => Number(match[1]))
    .filter((year, index, list) => year >= 1970 && list.indexOf(year) === index);

  return years.flatMap((year) =>
    parseJambWaecQuestions({ text, exam, subject, year }).map((question) => ({
      exam,
      subject,
      year,
      questionNumber: question.questionNumber,
      question: question.question,
      options: question.options,
      correctAnswer: question.correctAnswer,
      instruction: question.context?.sharedContextLabel?.toLowerCase().includes("instruction")
        ? question.context?.passage
        : undefined,
      passage: question.context?.sharedContextLabel?.toLowerCase().includes("instruction")
        ? undefined
        : question.context?.passage,
      visual: question.context?.imageDescription ? { description: question.context.imageDescription } : undefined,
      contextLabel: question.context?.sharedContextLabel,
      importBatchId,
      extractionSource: "PARSER_FALLBACK",
      reviewFlags: ["parser_fallback"],
      source: "PAST_QUESTION",
    }))
  );
}

function buildYearSummary(questions: NormalizedPastQuestion[]) {
  const summary = new Map<number, {
    extracted: number;
    visualQuestions: number;
    contextLinkedQuestions: number;
    lowConfidence: number;
  }>();

  questions.forEach((question) => {
    const current = summary.get(question.year) || {
      extracted: 0,
      visualQuestions: 0,
      contextLinkedQuestions: 0,
      lowConfidence: 0,
    };

    current.extracted++;
    if (question.visual?.description || question.visual?.imageUrl) current.visualQuestions++;
    if (question.instruction || question.passage || question.contextLabel) current.contextLinkedQuestions++;
    if ((question.confidence ?? 1) < 0.7) current.lowConfidence++;
    summary.set(question.year, current);
  });

  return [...summary.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, values]) => ({ year, ...values }));
}

async function updateJob(
  jobId: string,
  update: Record<string, unknown>,
  log?: { level: "info" | "warning" | "error"; message: string; meta?: Record<string, unknown> }
) {
  const push = log
    ? {
        logs: {
          level: log.level,
          message: log.message,
          meta: log.meta,
          createdAt: new Date(),
        },
      }
    : undefined;

  await ImportJob.updateOne(
    { _id: jobId },
    {
      $set: update,
      ...(push ? { $push: push } : {}),
    }
  );
}

export async function processPastQuestionImportJob({
  jobId,
  pdfBuffer,
  exam,
  subject,
  mode,
}: ProcessImportInput) {
  await connectMongoose();

  const importBatchId = randomUUID();
  let skipped: ImportJobResult["skippedItems"] = [];
  let detectedYears: number[] = [];
  let extractionSource: ImportJobResult["extractionSource"] = "AI";

  try {
    await updateJob(
      jobId,
      {
        status: "processing",
        stage: "reading_pdf",
        progressMessage: "Reading PDF text",
        startedAt: new Date(),
      },
      { level: "info", message: "Started PDF import" }
    );

    const text = await parsePdfText(pdfBuffer);
    if (!text?.trim()) throw new Error("No readable text found in PDF");

    await updateJob(
      jobId,
      { stage: "extracting_questions", progressMessage: "Extracting questions" },
      { level: "info", message: "PDF text extracted" }
    );

    let questions: NormalizedPastQuestion[] = [];

    if (mode === "ai" && process.env.GEMINI_API_KEY) {
      try {
        const extracted = await extractPastQuestionsAiFirst({
          text,
          pdfBuffer,
          exam,
          subject,
          importBatchId,
        });
        questions = extracted.questions;
        skipped = extracted.skipped;
        detectedYears = extracted.detectedYears;
      } catch (error) {
        extractionSource = "PARSER_FALLBACK";
        skipped.push({ reason: error instanceof Error ? error.message : String(error) });
        await updateJob(
          jobId,
          { stage: "parser_fallback", progressMessage: "AI failed, using parser fallback" },
          { level: "warning", message: "AI extraction failed; using parser fallback" }
        );
        questions = toParserFallbackQuestions({ text, exam, subject, importBatchId });
      }
    } else {
      extractionSource = "PARSER_FALLBACK";
      if (mode === "ai") skipped.push({ reason: "GEMINI_API_KEY is not configured" });
      questions = toParserFallbackQuestions({ text, exam, subject, importBatchId });
    }

    if (questions.length === 0) throw new Error("No questions detected in PDF");

    const contextEnrichment = enrichQuestionsWithPdfContext({
      questions,
      text,
      exam,
      subject,
      importBatchId,
    });
    questions = contextEnrichment.questions;

    await updateJob(
      jobId,
      { stage: "processing_visuals", progressMessage: "Processing visual question context" },
      {
        level: "info",
        message: `Extracted ${questions.length} candidate questions`,
        meta: contextEnrichment.stats,
      }
    );

    questions = await enrichQuestionVisuals({ questions, pdfBuffer, importBatchId });

    await updateJob(
      jobId,
      { stage: "saving_questions", progressMessage: "Saving questions to database" },
      { level: "info", message: "Saving normalized questions" }
    );

    const bulkOps = questions.map((question) => ({
      updateOne: {
        filter: question.questionNumber
          ? {
              exam: question.exam,
              subject: question.subject,
              year: question.year,
              $or: [
                { questionNumber: question.questionNumber },
                { question: question.question, questionNumber: { $exists: false } },
              ],
            }
          : {
              exam: question.exam,
              subject: question.subject,
              year: question.year,
              question: question.question,
            },
        update: { $set: question },
        upsert: true,
      },
    }));

    const result = await PastQuestion.bulkWrite(bulkOps, { ordered: false });
    const updated = result.modifiedCount;
    const inserted = result.upsertedCount;
    const duplicates = Math.max(0, questions.length - inserted - updated);
    const visualQuestions = questions.filter((question) => question.visual?.description || question.visual?.imageUrl).length;
    const contextLinkedQuestions = questions.filter((question) => question.instruction || question.passage || question.contextLabel).length;
    const lowConfidence = questions.filter((question) => (question.confidence ?? 1) < 0.7).length;

    const importResult: ImportJobResult = {
      importBatchId,
      mode,
      extractionSource,
      detectedYears,
      extracted: questions.length,
      inserted,
      updated,
      duplicates,
      skipped: skipped.length,
      skippedItems: skipped.slice(0, 25),
      visualQuestions,
      contextLinkedQuestions,
      lowConfidence,
      yearSummary: buildYearSummary(questions),
    };

    await updateJob(
      jobId,
      {
        status: "completed",
        stage: "completed",
        progressMessage: "Import completed",
        result: importResult,
        completedAt: new Date(),
      },
      { level: "info", message: "Import completed", meta: { extracted: questions.length, inserted, updated } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJob(
      jobId,
      {
        status: "failed",
        stage: "failed",
        progressMessage: "Import failed",
        error: message,
        completedAt: new Date(),
      },
      { level: "error", message }
    );
  }
}

export function startPastQuestionImportJob(input: ProcessImportInput) {
  setTimeout(() => {
    processPastQuestionImportJob(input).catch((error) => {
      console.error("Unhandled import job error", error);
    });
  }, 0);
}
