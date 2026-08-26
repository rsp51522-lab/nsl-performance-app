import { env } from "cloudflare:workers";

const defaultStaff = ["浅野", "鹿島", "川西"];
const staffKey = "staff";

function normalizeStaffList(values: unknown[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const name = String(value || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    normalized.push(name);
  }
  return normalized;
}

async function ensureSettingsTable() {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`,
  ).run();
}

async function readStaff() {
  await ensureSettingsTable();
  const row = await env.DB.prepare("SELECT data FROM app_settings WHERE key = ?")
    .bind(staffKey)
    .first<{ data: string }>();
  if (!row?.data) return defaultStaff;
  try {
    const parsed = JSON.parse(row.data);
    return Array.isArray(parsed) ? normalizeStaffList([...defaultStaff, ...parsed]) : defaultStaff;
  } catch {
    return defaultStaff;
  }
}

export async function GET() {
  try {
    return Response.json({ staff: await readStaff() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return Response.json({ error: message, staff: defaultStaff }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as { staff?: unknown[] };
    const staff = normalizeStaffList([...defaultStaff, ...(Array.isArray(payload.staff) ? payload.staff : [])]);
    await ensureSettingsTable();
    await env.DB.prepare(
      `INSERT INTO app_settings (key, data, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(staffKey, JSON.stringify(staff))
      .run();
    return Response.json({ staff });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save settings";
    return Response.json({ error: message }, { status: 500 });
  }
}
