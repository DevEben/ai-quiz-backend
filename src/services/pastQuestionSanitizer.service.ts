import { UnifiedQuestion } from "@/interfaces/question.interface";

type RawPastQuestion = {
  question?: string;
  options?: {
    A?: string;
    B?: string;
    C?: string;
    D?: string;
  };
  instruction?: string;
  passage?: string;
  contextLabel?: string;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSpaces(value?: string) {
  return (value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTrailingOptions(question: string, options: RawPastQuestion["options"]) {
  let cleaned = normalizeSpaces(question);
  const optionValues = ["A", "B", "C", "D"]
    .map((key) => normalizeSpaces(options?.[key as keyof RawPastQuestion["options"]]))
    .filter(Boolean);

  if (optionValues.length === 4) {
    const optionSequence = new RegExp(
      `\\s*A[\\.)]?\\s*${escapeRegex(optionValues[0])}\\s*B[\\.)]?\\s*${escapeRegex(optionValues[1])}\\s*C[\\.)]?\\s*${escapeRegex(optionValues[2])}\\s*D[\\.)]?\\s*${escapeRegex(optionValues[3])}\\s*$`,
      "i"
    );
    cleaned = cleaned.replace(optionSequence, "").trim();
  }

  return cleaned
    .replace(/\s+\(?A\)?[\.)]\s+.+?\s+\(?B\)?[\.)]\s+.+?\s+\(?C\)?[\.)]\s+.+?\s+\(?D\)?[\.)]\s+.+$/i, "")
    .trim();
}

function passageLooksLikeInlineOptionDump(passage?: string) {
  const text = normalizeSpaces(passage);
  if (!text) return false;

  const optionMarkers = (text.match(/(?:^|\s|\[|\()A[\.)]\s+/g) || []).length;
  const gapMarkers = (text.match(/\.{2,}\s*\d{1,3}|…\s*\d{1,3}/g) || []).length;
  const bracketedOptions = (text.match(/\[[^\]]*\bA[\.)]\s+[\s\S]*?\bD[\.)]\s+[^\]]*\]/g) || []).length;

  return text.length > 350 && (optionMarkers >= 4 || gapMarkers >= 4 || bracketedOptions >= 3);
}

function questionNeedsClozePassage(question?: string) {
  const text = normalizeSpaces(question).toLowerCase();
  return /\b(gap|blank|space|passage|cloze)\b/.test(text) || /\.{2,}|____|…/.test(text);
}

export function sanitizePastQuestionForQuiz(question: UnifiedQuestion, raw: RawPastQuestion): UnifiedQuestion {
  const sanitized: UnifiedQuestion = {
    ...question,
    question: stripTrailingOptions(question.question, raw.options),
    options: question.options.map((option) => normalizeSpaces(option)),
    instruction: normalizeSpaces(question.instruction) || undefined,
    passage: normalizeSpaces(question.passage) || undefined,
    contextLabel: normalizeSpaces(question.contextLabel) || undefined,
  };

  if (
    passageLooksLikeInlineOptionDump(sanitized.passage) &&
    !questionNeedsClozePassage(sanitized.question)
  ) {
    sanitized.passage = undefined;
    sanitized.contextLabel = sanitized.contextLabel?.toLowerCase().includes("passage")
      ? undefined
      : sanitized.contextLabel;
  }

  return sanitized;
}
