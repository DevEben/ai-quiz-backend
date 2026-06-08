export type ImportJobStatus = "queued" | "processing" | "completed" | "failed";
export type ImportJobLogLevel = "info" | "warning" | "error";

export type ImportJobLog = {
  level: ImportJobLogLevel;
  message: string;
  createdAt: Date;
  meta?: Record<string, unknown>;
};

export type ImportJobResult = {
  importBatchId: string;
  mode: "ai" | "parser";
  extractionSource: "AI" | "PARSER_FALLBACK";
  detectedYears: number[];
  extracted: number;
  inserted: number;
  updated: number;
  duplicates: number;
  skipped: number;
  skippedItems: Array<{ year?: number; questionNumber?: number; reason: string }>;
  visualQuestions: number;
  contextLinkedQuestions: number;
  lowConfidence: number;
  yearSummary: Array<{
    year: number;
    extracted: number;
    visualQuestions: number;
    contextLinkedQuestions: number;
    lowConfidence: number;
  }>;
};
