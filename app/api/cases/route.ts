import { env } from "cloudflare:workers";
import seed from "../../seed-data.json";
import { isRewardAdmin } from "../reward-auth/session";

type Row = (string | number)[];
type CaseRecord = Record<string, string | number>;

const caseHeaders = [
  ...(seed.cases.headers as string[]),
  "営業報酬率",
  "開発報酬率",
  "サブ報酬率",
];
const rewardRateHeaders = ["営業報酬率", "開発報酬率", "サブ報酬率"];
const seedRows = seed.cases.rows as Row[];

function rowToRecord(row: Row): CaseRecord {
  return Object.fromEntries(caseHeaders.map((key, index) => [key, row[index] ?? ""]));
}

function normalizeCase(payload: unknown): CaseRecord {
  const source =
    payload && typeof payload === "object" && "case" in payload
      ? (payload as { case: unknown }).case
      : payload;
  const record = source && typeof source === "object" ? (source as CaseRecord) : {};
  return Object.fromEntries(caseHeaders.map((key) => [key, record[key] ?? ""]));
}

async function ensureSeeded() {
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM cases").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;

  const statements = seedRows.map((row) => {
    const record = rowToRecord(row);
    return env.DB.prepare("INSERT INTO cases (no, data) VALUES (?, ?)").bind(
      Number(record["NO"]) || 0,
      JSON.stringify(record),
    );
  });
  if (statements.length) {
    await env.DB.batch(statements);
  }
}

async function readCases() {
  await ensureSeeded();
  const result = await env.DB.prepare("SELECT id, data FROM cases ORDER BY no, id").all<{
    id: number;
    data: string;
  }>();
  return result.results.map((item) => ({ id: item.id, ...JSON.parse(item.data) }));
}

export async function GET() {
  try {
    const cases = await readCases();
    return Response.json({ headers: caseHeaders, cases });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load cases";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const record = normalizeCase(payload);
    if (!isRewardAdmin(request)) {
      for (const key of rewardRateHeaders) record[key] = "";
    }
    const maxRow = await env.DB.prepare("SELECT MAX(no) AS maxNo FROM cases").first<{
      maxNo: number | null;
    }>();
    const nextNo = Number(record["NO"]) || (Number(maxRow?.maxNo) || 0) + 1;
    record["NO"] = nextNo;

    const result = await env.DB.prepare(
      "INSERT INTO cases (no, data) VALUES (?, ?) RETURNING id",
    )
      .bind(nextNo, JSON.stringify(record))
      .first<{ id: number }>();

    return Response.json({ case: { id: result?.id, ...record } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save case";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as { case?: CaseRecord & { id?: number } };
    const id = Number(payload.case?.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const record = normalizeCase(payload);
    const no = Number(record["NO"]) || id;
    record["NO"] = no;

    if (!isRewardAdmin(request)) {
      const current = await env.DB.prepare("SELECT data FROM cases WHERE id = ?")
        .bind(id)
        .first<{ data: string }>();
      const currentRecord = current?.data ? (JSON.parse(current.data) as CaseRecord) : {};
      for (const key of rewardRateHeaders) {
        record[key] = currentRecord[key] ?? "";
      }
    }

    await env.DB.prepare(
      "UPDATE cases SET no = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
      .bind(no, JSON.stringify(record), id)
      .run();

    return Response.json({ case: { id, ...record } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update case";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      id?: number;
      case?: { id?: number };
    };
    const id = Number(payload.id ?? payload.case?.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    await env.DB.prepare("DELETE FROM cases WHERE id = ?").bind(id).run();

    return Response.json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete case";
    return Response.json({ error: message }, { status: 500 });
  }
}
