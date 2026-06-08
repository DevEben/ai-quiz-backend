import mongoose, { Document, Schema } from "mongoose";
import {
  ImportJobLog,
  ImportJobResult,
  ImportJobStatus,
} from "@/interfaces/importJob.interface";

export interface ImportJobDocument extends Document {
  status: ImportJobStatus;
  exam: "JAMB" | "WAEC";
  subject: string;
  mode: "ai" | "parser";
  fileName: string;
  fileSize: number;
  createdBy: string;
  stage?: string;
  progressMessage?: string;
  result?: ImportJobResult;
  error?: string;
  logs: ImportJobLog[];
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ImportJobSchema = new Schema<ImportJobDocument>(
  {
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      required: true,
      default: "queued",
    },
    exam: { type: String, enum: ["JAMB", "WAEC"], required: true },
    subject: { type: String, required: true },
    mode: { type: String, enum: ["ai", "parser"], required: true },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    createdBy: { type: String, required: true },
    stage: { type: String },
    progressMessage: { type: String },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    logs: [
      {
        level: { type: String, enum: ["info", "warning", "error"], required: true },
        message: { type: String, required: true },
        createdAt: { type: Date, required: true },
        meta: { type: Schema.Types.Mixed },
      },
    ],
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

ImportJobSchema.index({ createdAt: -1 });
ImportJobSchema.index({ createdBy: 1, createdAt: -1 });

export const ImportJob =
  mongoose.models.ImportJob ||
  mongoose.model<ImportJobDocument>("ImportJob", ImportJobSchema);
