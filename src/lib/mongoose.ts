import mongoose from "mongoose";
import { logger } from "./logger";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/ai-quiz-master";
const dbName = process.env.MONGODB_DB || "ai-quiz-master";
const log = logger("mongoose");

type GlobalWithMongoose = typeof globalThis & {
  _mongooseConnection?: Promise<typeof mongoose>;
};

const globalWithMongoose = globalThis as GlobalWithMongoose;

export async function connectMongoose() {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!globalWithMongoose._mongooseConnection) {
    log.info("Connecting Mongoose...", { dbName });
    globalWithMongoose._mongooseConnection = mongoose.connect(uri, {
      dbName,
      bufferCommands: false,
    });
  }

  return globalWithMongoose._mongooseConnection;
}
