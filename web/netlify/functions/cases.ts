import { randomBytes } from "node:crypto";
import type { Config, Context } from "@netlify/functions";
import { MongoClient } from "mongodb";
import sample from "../../../shared/sample-case.json";
import type { CaseBundle, CaseSummary } from "../../../shared/types";
import { readEnv } from "../env";

const sampleBundle = sample as CaseBundle;

export default async (req: Request, context: Context) => {
  const id = context.params.id;
  try {
    if (req.method === "GET" && !id) return await listCases();
    if (req.method === "GET" && id) return await getCase(id);
    if (req.method === "POST" && !id) return await createCase(await req.json() as { name?: string; operator?: string });
    if (req.method === "POST" && id) return await archiveCase(id);
    return new Response("Method not allowed", { status: 405 });
  } catch {
    return Response.json({ message: "The case service failed before it could read Atlas." }, { status: 500 });
  }
};

async function listCases() {
  const remote = await loadRemote();
  const cases = [sampleBundle.summary];
  if (remote.cases) {
    for (const item of remote.cases) {
      if (item.summary.id !== sampleBundle.summary.id) cases.push(item.summary);
    }
  }
  return Response.json({ atlas: remote.atlas, atlasError: remote.atlasError, cases });
}

async function getCase(id: string) {
  if (id === sampleBundle.summary.id) return Response.json(sampleBundle);
  const remote = await loadRemote();
  const found = remote.cases?.find((item) => item.summary.id === id);
  if (!found) {
    const message = remote.atlas ? "That case is not in the OpenForensic database." : "That case is not in the sample set, and Atlas is not connected.";
    return Response.json({ message }, { status: 404 });
  }
  return Response.json(found);
}

async function createCase(input: { name?: string; operator?: string }) {
  const name = input.name?.trim() ?? "";
  const operator = input.operator?.trim() ?? "";
  if (!name || !operator) return Response.json({ message: "Case name and operator are required." }, { status: 400 });
  const handle = await connect();
  if (!handle) {
    return Response.json({ message: "Atlas is not connected. Set MONGODB_URI on the host. The Harbor Street sample is still available." }, { status: 503 });
  }
  const id = `${slug(name)}-${randomBytes(3).toString("hex")}`;
  const createdAt = new Date().toISOString();
  const summary: CaseSummary = {
    id,
    name,
    operator,
    createdAt,
    sample: false,
    status: "open",
    deviceLabel: "No device yet",
    ownerName: "This phone",
    ownerNumber: "",
  };
  const bundle: CaseBundle = {
    summary,
    messages: [],
    calls: [],
    contacts: [],
    media: [],
    manifest: { caseId: id, operator, createdAt, device: null, items: [] },
    audit: [{ id: randomBytes(8).toString("hex"), at: createdAt, action: "case_created", level: "info", detail: `${operator} created ${name} from the web viewer.` }],
  };
  try {
    await handle.collection.updateOne({ "summary.id": id }, { $set: bundle }, { upsert: true });
  } finally {
    await handle.client.close();
  }
  return Response.json(summary);
}

async function archiveCase(id: string) {
  if (id === sampleBundle.summary.id) {
    return Response.json({ message: "The sample case stays available." }, { status: 400 });
  }
  const handle = await connect();
  if (!handle) return Response.json({ message: "Atlas is not connected, so this case cannot be archived from the viewer." }, { status: 503 });
  try {
    const found = await handle.collection.findOne({ "summary.id": id });
    if (!found) return Response.json({ message: "That case is not in the OpenForensic database." }, { status: 404 });
    found.summary.status = "archived";
    found.audit.push({
      id: randomBytes(8).toString("hex"),
      at: new Date().toISOString(),
      action: "case_archived",
      level: "info",
      detail: "Archived from the web viewer. The record was kept.",
    });
    await handle.collection.updateOne({ "summary.id": id }, { $set: found });
    return Response.json({ ok: true });
  } finally {
    await handle.client.close();
  }
}

async function loadRemote(): Promise<{ atlas: boolean; atlasError: string | null; cases: CaseBundle[] | null }> {
  const handle = await connect();
  if (!handle) return { atlas: false, atlasError: null, cases: null };
  try {
    const cases = await handle.collection.find({}).limit(50).toArray();
    return { atlas: true, atlasError: null, cases };
  } catch {
    return { atlas: false, atlasError: "Atlas refused the case query.", cases: null };
  } finally {
    await handle.client.close();
  }
}

async function connect() {
  const uri = readEnv("MONGODB_URI");
  if (!uri) return null;
  const client = new MongoClient(uri);
  await client.connect();
  const collection = client.db("OpenForensic").collection<CaseBundle>("cases");
  return { client, collection };
}

function slug(value: string): string {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (base || "case").slice(0, 40);
}

export const config: Config = {
  path: ["/api/cases", "/api/cases/:id"],
};
