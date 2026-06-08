import { parseJambWaecQuestions, ParsedPastQuestion } from "@/lib/parsePastQuestions";
import { NormalizedPastQuestion } from "@/interfaces/pastQuestion.interface";

type EnrichInput = {
  questions: NormalizedPastQuestion[];
  text: string;
  exam: "JAMB" | "WAEC";
  subject: string;
  importBatchId: string;
};

export type ContextEnrichmentStats = {
  inferredQuestionNumbers: number;
  attachedInstructions: number;
  attachedPassages: number;
  attachedVisualDescriptions: number;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactQuestionKey(value: string) {
  return normalizeText(value).slice(0, 180);
}

function contextRangeFromLabel(label?: string) {
  const match = label?.match(/questions?\s+(\d{1,3})(?:\s*(?:to|-|and)\s*(\d{1,3}))?/i);
  if (!match) return undefined;

  const start = Number(match[1]);
  const end = Number(match[2] || match[1]);
  if (!start || !end) return undefined;

  return {
    startQuestionNumber: Math.min(start, end),
    endQuestionNumber: Math.max(start, end),
  };
}

function isInstructionLabel(label?: string) {
  return label?.toLowerCase().includes("instruction") || false;
}

function findParsedMatch(
  question: NormalizedPastQuestion,
  byNumber: Map<number, ParsedPastQuestion>,
  byText: Map<string, ParsedPastQuestion>
) {
  if (question.questionNumber) {
    const numbered = byNumber.get(question.questionNumber);
    if (numbered) return numbered;
  }

  const exact = byText.get(compactQuestionKey(question.question));
  if (exact) return exact;

  const questionKey = normalizeText(question.question);
  if (questionKey.length < 20) return undefined;

  for (const [parsedKey, parsedQuestion] of byText.entries()) {
    if (parsedKey.length < 20) continue;
    if (parsedKey.includes(questionKey.slice(0, 80)) || questionKey.includes(parsedKey.slice(0, 80))) {
      return parsedQuestion;
    }
  }

  return undefined;
}

export function enrichQuestionsWithPdfContext({
  questions,
  text,
  exam,
  subject,
  importBatchId,
}: EnrichInput) {
  const stats: ContextEnrichmentStats = {
    inferredQuestionNumbers: 0,
    attachedInstructions: 0,
    attachedPassages: 0,
    attachedVisualDescriptions: 0,
  };
  const years = [...new Set(questions.map((question) => question.year))];
  const parserByYear = new Map<number, ParsedPastQuestion[]>();

  years.forEach((year) => {
    parserByYear.set(year, parseJambWaecQuestions({ text, exam, subject, year }));
  });

  const enriched = questions.map((question) => {
    const parsedQuestions = parserByYear.get(question.year) || [];
    const byNumber = new Map(
      parsedQuestions
        .filter((parsed) => parsed.questionNumber)
        .map((parsed) => [parsed.questionNumber as number, parsed])
    );
    const byText = new Map(parsedQuestions.map((parsed) => [compactQuestionKey(parsed.question), parsed]));
    const parsed = findParsedMatch(question, byNumber, byText);
    const next: NormalizedPastQuestion = {
      ...question,
      importBatchId: question.importBatchId || importBatchId,
      source: "PAST_QUESTION",
    };

    if (!parsed) return next;

    if (!next.questionNumber && parsed.questionNumber) {
      next.questionNumber = parsed.questionNumber;
      stats.inferredQuestionNumbers++;
      next.reviewFlags = [...(next.reviewFlags || []), "question_number_inferred_from_pdf_text"];
    }

    const parsedContext = parsed.context;
    if (!parsedContext?.passage && !parsedContext?.imageDescription) return next;

    const contextLabel = next.contextLabel || parsedContext.sharedContextLabel;
    const contextRange = next.contextAppliesTo || contextRangeFromLabel(contextLabel);

    if (contextLabel && !next.contextLabel) next.contextLabel = contextLabel;
    if (contextRange && !next.contextAppliesTo) next.contextAppliesTo = contextRange;

    if (parsedContext.passage) {
      if (isInstructionLabel(contextLabel)) {
        if (!next.instruction) {
          next.instruction = parsedContext.passage;
          stats.attachedInstructions++;
        }
      } else if (!next.passage) {
        next.passage = parsedContext.passage;
        stats.attachedPassages++;
      }
    }

    if (parsedContext.imageDescription && !next.visual?.description) {
      next.visual = {
        ...next.visual,
        description: parsedContext.imageDescription,
      };
      stats.attachedVisualDescriptions++;
    }

    return next;
  });

  return { questions: enriched, stats };
}
