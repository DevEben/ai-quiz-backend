import { MongoClient, Db, Document } from "mongodb";
import { logger } from "./logger";

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/ai-quiz-master";
const dbName = process.env.MONGODB_DB || "ai-quiz-master";
const log = logger("db");

type GlobalWithMongo = typeof globalThis & {
  _mongoClient?: MongoClient;
  _mongoDb?: Db;
};

const globalWithMongo = globalThis as GlobalWithMongo;

export async function getDb(): Promise<Db> {
  if (globalWithMongo._mongoDb) return globalWithMongo._mongoDb;

  const client = globalWithMongo._mongoClient ?? new MongoClient(uri);
  if (!globalWithMongo._mongoClient) {
    log.info("Connecting to MongoDB...", { dbName });
    await client.connect();
    globalWithMongo._mongoClient = client;
    log.info("MongoDB connected", { dbName });
  } else {
    log.debug("Reusing existing MongoDB client", { dbName });
  }

  const db = client.db(dbName);
  globalWithMongo._mongoDb = db;
  return db;
}

export async function getCollection<TSchema extends Document = Document>(name: string) {
  const db = await getDb();
  return db.collection<TSchema>(name);
}

