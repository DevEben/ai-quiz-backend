import mongoose, { Schema, Document } from "mongoose";
import {
  ContextAppliesTo,
  PastQuestionExtractionSource,
  PastQuestionVisual,
} from "@/interfaces/pastQuestion.interface";

export interface PastQuestionDocument extends Document {
  exam: "JAMB" | "WAEC";
  subject: string;
  year: number;
  questionNumber: number;
  instruction?: string;
  passage?: string;
  visual?: PastQuestionVisual;
  contextLabel?: string;
  contextAppliesTo?: ContextAppliesTo;
  context?: {
    passage?: string;
    imageDescription?: string;
    sharedContextLabel?: string;
  };
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctAnswer: "A" | "B" | "C" | "D";
  source: "PAST_QUESTION";
  importBatchId?: string;
  extractionSource?: PastQuestionExtractionSource;
  confidence?: number;
  reviewFlags?: string[];
  createdAt: Date;
}

const PastQuestionSchema = new Schema<PastQuestionDocument>(
  {
    exam: { type: String, required: true },
    subject: { type: String, required: true },
    year: { type: Number, required: true },
    questionNumber: { type: Number },
    instruction: { type: String },
    passage: { type: String },
    visual: {
      imageUrl: { type: String },
      imagePublicId: { type: String },
      description: { type: String },
      label: { type: String },
      pageNumber: { type: Number },
    },
    contextLabel: { type: String },
    contextAppliesTo: {
      startQuestionNumber: { type: Number },
      endQuestionNumber: { type: Number },
    },
    // Legacy context kept so older imported records still read correctly.
    context: {
      passage: { type: String },
      imageDescription: { type: String },
      sharedContextLabel: { type: String },
    },
    question: { type: String, required: true },
    options: {
      A: { type: String, required: true },
      B: { type: String, required: true },
      C: { type: String, required: true },
      D: { type: String, required: true },
    },
    correctAnswer: { type: String, enum: ["A", "B", "C", "D"], required: true },
    source: { type: String, default: "PAST_QUESTION" },
    importBatchId: { type: String },
    extractionSource: { type: String, enum: ["AI", "PARSER_FALLBACK"] },
    confidence: { type: Number },
    reviewFlags: [{ type: String }],
  },
  { timestamps: true }
);

PastQuestionSchema.index(
  { exam: 1, subject: 1, year: 1, questionNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { questionNumber: { $exists: true } },
  }
);

PastQuestionSchema.index(
  { exam: 1, subject: 1, year: 1, question: 1 },
  {
    unique: true,
    partialFilterExpression: { questionNumber: { $exists: false } },
  }
);

export const PastQuestion =
  mongoose.models.PastQuestion ||
  mongoose.model<PastQuestionDocument>("PastQuestion", PastQuestionSchema);
