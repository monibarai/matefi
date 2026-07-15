// src/db/client.ts — MongoDB connection.
import { MongoClient, Db, Collection, Document } from 'mongodb';
import { config } from '../config';

const client = new MongoClient(config.MONGODB_URI);

let dbInstance: Db | null = null;
let connecting: Promise<Db> | null = null;

/** Lazily connect and cache the Db handle. */
export async function getDb(): Promise<Db> {
  if (dbInstance) return dbInstance;
  if (!connecting) {
    connecting = client.connect().then((c) => {
      dbInstance = c.db(config.MONGODB_DB);
      return dbInstance;
    });
  }
  return connecting;
}

/** Typed collection accessor. */
export async function collection<T extends Document = Document>(
  name: string
): Promise<Collection<T>> {
  const d = await getDb();
  return d.collection<T>(name);
}

/** Health check — throws if the server is unreachable. */
export async function pingDb(): Promise<void> {
  const d = await getDb();
  await d.command({ ping: 1 });
}

export async function closeDb(): Promise<void> {
  await client.close();
}

/**
 * Monotonic numeric id per collection — mirrors the old Postgres SERIAL columns
 * so the `id` field on move/evaluation/trader rows stays a stable number.
 */
export async function nextSeq(name: string): Promise<number> {
  const d = await getDb();
  const res = await d.collection<{ _id: string; seq: number }>('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return res?.seq ?? 1;
}
