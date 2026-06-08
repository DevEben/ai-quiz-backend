export type ExamType = "JAMB" | "WAEC";
export type AnswerOption = "A" | "B" | "C" | "D";
export type PastQuestionExtractionSource = "AI" | "PARSER_FALLBACK";

export type PastQuestionVisual = {
  imageUrl?: string;
  imagePublicId?: string;
  description?: string;
  label?: string;
  pageNumber?: number;
};

export type ContextAppliesTo = {
  startQuestionNumber?: number;
  endQuestionNumber?: number;
};

export type NormalizedPastQuestion = {
  exam: ExamType;
  subject: string;
  year: number;
  questionNumber?: number;
  question: string;
  options: Record<AnswerOption, string>;
  correctAnswer: AnswerOption;
  instruction?: string;
  passage?: string;
  visual?: PastQuestionVisual;
  contextLabel?: string;
  contextAppliesTo?: ContextAppliesTo;
  importBatchId: string;
  extractionSource: PastQuestionExtractionSource;
  confidence?: number;
  reviewFlags?: string[];
  source: "PAST_QUESTION";
};
