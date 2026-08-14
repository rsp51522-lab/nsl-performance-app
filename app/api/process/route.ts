import { env } from "cloudflare:workers";
import seed from "../../seed-data.json";

type Row = (string | number)[];
type ProcessRecord = Record<string, string | number | boolean | string[]>;

const processHeaders = seed.process.headers as string[];
const seedRows = seed.process.rows as Row[];
const steps = [
  "申込",
  "デモ作成",
  "見積作成",
  "見積内容で進捗工程決定",
  "作成開始入力",
  "納期入力",
  "作業内容進捗報告",
];

function rowToRecord(row: Row): ProcessRecord {
  const base = Object.fromEntries(processHeaders.map((key, index) => [key, row[index] ?? ""]));
  const hours = (Number(base["合計日数"]) || 0) * 8;
  const completed = base["納期判定"] === "納品済";
  const completedSteps = [
    base["初回申込"] ? "申込" : "",
    base["作業内容"] ? "見積内容で進捗工程決定" : "",
    base["作業開始"] ? "作成開始入力" : "",
    base["最終納品予定"] ? "納期入力" : "",
  ].filter(Boolean);

  return {
    ...base,
    作業時間: hours || "",
    作業日数: hours ? Math.ceil(hours / 8) : "",
    作業状況: completed ? "完了" : "作成中",
    完了: completed,
    進捗工程: completedSteps,
    見積PDF名: "",
    見積読込内容: "",
    作業内容進捗報告: "",
  };
}

function statusFor(item: ProcessRecord) {
  if (item["完了"] === true || item["作業状況"] === "完了") return "納品済";
  const due = item["最終納品予定"] ? new Date(String(item["最終納品予定"])) : null;
  if (!due || Number.isNaN(due.getTime())) return "未設定";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due < today) return "遅延";
  const diffDays = (due.getTime() - today.getTime()) / 86400000;
  if (diffDays <= 3) return "3日以内";
  return "予定内";
}

function normalize(item: ProcessRecord): ProcessRecord {
  const hours = Number(item["作業時間"]) || 0;
  const next = {
    ...item,
    作業日数: hours ? Math.ceil(hours / 8) : "",
    完了: item["完了"] === true || item["作業状況"] === "完了",
    作業状況: item["完了"] === true || item["作業状況"] === "完了" ? "完了" : "作成中",
  };
  next["納期判定"] = statusFor(next);
  if (!Array.isArray(next["進捗工程"])) {
    next["進捗工程"] = String(next["進捗工程"] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return next;
}

async function ensureSeeded() {
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM process_items").first<{
    count: number;
  }>();
  if ((count?.count ?? 0) > 0) return;

  const statements = seedRows.map((row) => {
    const record = normalize(rowToRecord(row));
    return env.DB.prepare("INSERT INTO process_items (company, data) VALUES (?, ?)").bind(
      String(record["会社名"] || ""),
      JSON.stringify(record),
    );
  });
  if (statements.length) await env.DB.batch(statements);
}

async function readItems() {
  await ensureSeeded();
  const result = await env.DB.prepare("SELECT id, data FROM process_items ORDER BY id").all<{
    id: number;
    data: string;
  }>();
  return result.results.map((item) => ({ id: item.id, ...normalize(JSON.parse(item.data)) }));
}

export async function GET() {
  try {
    return Response.json({ steps, items: await readItems() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load process items";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as { item?: ProcessRecord & { id?: number } };
    const item = normalize(payload.item || {});
    const id = Number(payload.item?.id);
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    await env.DB.prepare(
      "UPDATE process_items SET company = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
      .bind(String(item["会社名"] || ""), JSON.stringify(item), id)
      .run();

    return Response.json({ item: { id, ...item } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update process item";
    return Response.json({ error: message }, { status: 500 });
  }
}
