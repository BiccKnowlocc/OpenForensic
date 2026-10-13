import { MongoClient } from "mongodb";
import type { CaseBundle } from "../../shared/types";

export async function publishBundle(uri: string, bundle: CaseBundle): Promise<void> {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    await client.db("OpenForensic").collection<CaseBundle>("cases").updateOne(
      { "summary.id": bundle.summary.id },
      { $set: bundle },
      { upsert: true },
    );
  } finally {
    await client.close();
  }
}
