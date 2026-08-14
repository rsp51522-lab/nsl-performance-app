"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import seed from "./seed-data.json";

type Row = (string | number)[];
type SheetData = { headers: string[]; rows: Row[] };
type AppData = {
  cases: SheetData;
  process: SheetData;
  settings: Row[];
};
type CaseRecord = Record<string, string | number>;
type ProcessRecord = Record<string, string | number>;

const data = seed as AppData;
const sheetUrl =
  "https://docs.google.com/spreadsheets/d/1mzCoalbNbLwe8lkKmyuGBMp1NcFvJvs-ix_9_QkCaWI/edit";
const moneyHeaders = new Set([
  "税抜単価",
  "税抜金額",
  "消費税",
  "アポ金額",
  "申込金額",
  "入金金額",
  "担当申込金額",
  "担当入金金額",
  "未入金",
]);

function asObjects(sheet: SheetData) {
  return sheet.rows.map((row) =>
    Object.fromEntries(sheet.headers.map((key, index) => [key, row[index] ?? ""])),
  );
}

function yen(value: string | number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function dateValue(value: string | number) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(value: string | number) {
  const date = dateValue(value);
  return date ? date.toISOString().slice(0, 7) : "";
}

function statusClass(status: string | number) {
  if (status === "納品済") return "done";
  if (status === "遅延") return "late";
  if (status === "3日以内") return "soon";
  if (status === "予定内") return "plan";
  return "unset";
}

function weekStarts(rows: ProcessRecord[]) {
  const dates = rows
    .flatMap((row) => [dateValue(row["作業開始"]), dateValue(row["最終納品予定"])])
    .filter(Boolean) as Date[];
  if (!dates.length) return [];
  const min = new Date(Math.min(...dates.map((date) => date.getTime())));
  const max = new Date(Math.max(...dates.map((date) => date.getTime())));
  const day = min.getDay();
  min.setDate(min.getDate() + (day === 0 ? -6 : 1 - day));
  const weeks: Date[] = [];
  for (const date = new Date(min); date <= max; date.setDate(date.getDate() + 7)) {
    weeks.push(new Date(date));
  }
  return weeks;
}

function SimpleTable({
  headers,
  rows,
  compact = false,
}: {
  headers: string[];
  rows: (string | number)[][];
  compact?: boolean;
}) {
  return (
    <table className={compact ? "compact" : ""}>
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, index) => (
              <td
                className={moneyHeaders.has(headers[index]) ? "money" : ""}
                key={`${rowIndex}-${headers[index]}`}
              >
                {moneyHeaders.has(headers[index]) ? yen(cell) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Home() {
  const [view, setView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const cases = useMemo(() => asObjects(data.cases) as CaseRecord[], []);
  const process = useMemo(() => asObjects(data.process) as ProcessRecord[], []);

  const kpi = useMemo(
    () => ({
      total: cases.filter((row) => row["会社名"] || row["代表"]).length,
      appointments: cases.filter((row) => row["アポ日"]).length,
      applications: cases.filter((row) => row["申込状況"] === "済").length,
      payments: cases.filter((row) => row["入金状況"] === "済").length,
      contract: cases.reduce((sum, row) => sum + (Number(row["申込金額"]) || 0), 0),
      paid: cases.reduce((sum, row) => sum + (Number(row["入金金額"]) || 0), 0),
    }),
    [cases],
  );

  const monthlyRows = useMemo(() => {
    const rows = new Map<
      string,
      { month: string; count: number; paidCount: number; contract: number; paid: number }
    >();
    for (const row of cases) {
      const month = monthKey(row["申込日"]);
      if (!month) continue;
      if (!rows.has(month)) {
        rows.set(month, { month, count: 0, paidCount: 0, contract: 0, paid: 0 });
      }
      const item = rows.get(month)!;
      if (row["申込状況"] === "済") item.count += 1;
      if (row["入金状況"] === "済") item.paidCount += 1;
      item.contract += Number(row["申込金額"]) || 0;
      item.paid += Number(row["入金金額"]) || 0;
    }
    return [...rows.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => [
        row.month,
        row.count,
        row.paidCount,
        row.contract,
        row.paid,
        row.contract - row.paid,
      ]);
  }, [cases]);

  const peopleRows = useMemo(() => {
    return ["浅野", "鹿島", "川西", "未設定"].map((name) => {
      let appCount = 0;
      let payCount = 0;
      let app = 0;
      let pay = 0;
      let dev = 0;
      let sub = 0;

      for (const row of cases) {
        const amount = Number(row["申込金額"]) || 0;
        const paid = Number(row["入金金額"]) || 0;
        if (name === "浅野" && row["営業"] === name) {
          if (row["申込状況"] === "済") appCount += 1;
          if (row["入金状況"] === "済") payCount += 1;
          app += amount;
          pay += paid;
        } else if (name === "鹿島" || name === "川西") {
          const devRate = name === "鹿島" ? 0.7 : 0.5;
          if (row["開発"] === name || row["サブ"] === name) {
            if (row["申込状況"] === "済") appCount += 1;
            if (row["入金状況"] === "済") payCount += 1;
          }
          if (row["開発"] === name) {
            app += amount * devRate;
            pay += paid * devRate;
            dev += 1;
          }
          if (row["サブ"] === name) {
            app += amount * 0.35;
            pay += paid * 0.35;
            sub += 1;
          }
        }
      }
      return [name, appCount, app, payCount, pay, dev, sub];
    });
  }, [cases]);

  const filteredCases = cases.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(search.toLowerCase()),
  );
  const weeks = weekStarts(process);
  const processHeaders = [
    "NO",
    "会社名",
    "作業内容",
    "合計日数",
    "営業",
    "開発",
    "作業開始",
    "最終納品予定",
    "納期判定",
  ];

  return (
    <main>
      <header>
        <div>
          <h1>NSL実績管理アプリ</h1>
          <p>外部確認用ページ。保存データはGoogleスプレッドシートで管理しています。</p>
        </div>
        <a className="button" href={sheetUrl} rel="noreferrer" target="_blank">
          保存先を開く
        </a>
      </header>

      <nav className="tabs" aria-label="表示切替">
        {[
          ["dashboard", "ダッシュボード"],
          ["cases", "案件"],
          ["process", "会社別工程"],
          ["monthly", "月次"],
          ["people", "担当者"],
        ].map(([id, label]) => (
          <button
            className={view === id ? "active" : ""}
            key={id}
            onClick={() => setView(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "dashboard" && (
        <section>
          <div className="kpis">
            <Kpi label="全案件数" value={kpi.total} />
            <Kpi label="アポ件数" value={kpi.appointments} />
            <Kpi label="申込件数" value={kpi.applications} />
            <Kpi label="入金件数" value={kpi.payments} />
            <Kpi label="申込総額" value={yen(kpi.contract)} />
            <Kpi label="入金総額" value={yen(kpi.paid)} />
          </div>
          <div className="summary-grid">
            <Panel title="月次進捗">
              <SimpleTable
                compact
                headers={["月", "申込件数", "入金件数", "申込金額", "入金金額", "未入金"]}
                rows={monthlyRows}
              />
            </Panel>
            <Panel title="担当者別">
              <SimpleTable
                compact
                headers={[
                  "担当者",
                  "担当申込件数",
                  "担当申込金額",
                  "担当入金件数",
                  "担当入金金額",
                  "開発件数",
                  "サブ件数",
                ]}
                rows={peopleRows}
              />
            </Panel>
          </div>
        </section>
      )}

      {view === "cases" && (
        <Panel
          action={
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="会社名・代表・サービスで検索"
              value={search}
            />
          }
          title="案件"
        >
          <div className="table-wrap">
            <SimpleTable
              headers={data.cases.headers}
              rows={filteredCases.map((row) => data.cases.headers.map((header) => row[header] ?? ""))}
            />
          </div>
        </Panel>
      )}

      {view === "process" && (
        <Panel action={<span className="note">同一会社は1行に集約</span>} title="会社別工程">
          <div className="table-wrap">
            <table className="gantt">
              <thead>
                <tr>
                  {processHeaders.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                  {weeks.map((week) => (
                    <th key={week.toISOString()}>
                      {week.getMonth() + 1}/{week.getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {process.map((row, rowIndex) => {
                  const start = dateValue(row["作業開始"]);
                  const due = dateValue(row["最終納品予定"]);
                  return (
                    <tr key={rowIndex}>
                      {processHeaders.map((header) => (
                        <td key={header}>
                          {header === "納期判定" ? (
                            <span className={`status ${statusClass(row[header])}`}>{row[header]}</span>
                          ) : (
                            row[header]
                          )}
                        </td>
                      ))}
                      {weeks.map((week) => {
                        const end = new Date(week);
                        end.setDate(end.getDate() + 6);
                        const active = start && due && week <= due && end >= start;
                        return (
                          <td className="barcell" key={week.toISOString()}>
                            {active && <span className={`bar ${statusClass(row["納期判定"])}`} />}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {view === "monthly" && (
        <Panel title="月次">
          <SimpleTable
            headers={["月", "申込件数", "入金件数", "申込金額", "入金金額", "未入金"]}
            rows={monthlyRows}
          />
        </Panel>
      )}

      {view === "people" && (
        <Panel title="担当者">
          <SimpleTable
            headers={[
              "担当者",
              "担当申込件数",
              "担当申込金額",
              "担当入金件数",
              "担当入金金額",
              "開発件数",
              "サブ件数",
            ]}
            rows={peopleRows}
          />
        </Panel>
      )}
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
