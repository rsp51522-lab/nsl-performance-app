"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import seed from "./seed-data.json";

type Row = (string | number)[];
type SheetData = { headers: string[]; rows: Row[] };
type AppData = { cases: SheetData; process: SheetData; settings: Row[] };
type CaseRecord = Record<string, string | number>;
type ProcessRecord = Record<string, string | number | boolean | string[]>;
type ProcessItem = ProcessRecord & { id?: number };

const data = seed as AppData;
const caseHeaders = data.cases.headers;
const sheetUrl =
  "https://docs.google.com/spreadsheets/d/1mzCoalbNbLwe8lkKmyuGBMp1NcFvJvs-ix_9_QkCaWI/edit";
const defaultSteps = [
  "申込",
  "デモ作成",
  "見積作成",
  "見積内容で進捗工程決定",
  "作成開始入力",
  "納期入力",
  "作業内容進捗報告",
];
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
const initialForm: CaseRecord = {
  会社名: "",
  代表: "",
  アポ日: "",
  申込日: "",
  入金日: "",
  営業: "浅野",
  開発: "鹿島",
  サブ: "",
  申込状況: "",
  入金状況: "",
  サービス: "",
  税抜単価: "",
  個数: 1,
  税抜金額: "",
  消費税: "",
  アポ金額: "",
  申込金額: "",
  入金金額: "",
};

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

function dateValue(value: string | number | boolean | string[]) {
  if (!value || Array.isArray(value) || typeof value === "boolean") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(value: string | number) {
  const date = dateValue(value);
  return date ? date.toISOString().slice(0, 7) : "";
}

function calcDays(hours: string | number | boolean | string[]) {
  const value = Number(hours) || 0;
  return value ? Math.ceil(value / 8) : "";
}

function statusFor(item: ProcessRecord) {
  if (item["完了"] === true || item["作業状況"] === "完了") return "納品済";
  const due = dateValue(item["最終納品予定"]);
  if (!due) return "未設定";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due < today) return "遅延";
  const diffDays = (due.getTime() - today.getTime()) / 86400000;
  if (diffDays <= 3) return "3日以内";
  return "予定内";
}

function statusClass(status: string | number | boolean | string[]) {
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

function initialProcessItems() {
  return (asObjects(data.process) as ProcessRecord[]).map((row, index) => {
    const hours = (Number(row["合計日数"]) || 0) * 8;
    const steps = [
      row["初回申込"] ? "申込" : "",
      row["作業内容"] ? "見積内容で進捗工程決定" : "",
      row["作業開始"] ? "作成開始入力" : "",
      row["最終納品予定"] ? "納期入力" : "",
    ].filter(Boolean);
    const item = {
      id: index + 1,
      ...row,
      作業時間: hours || "",
      作業日数: hours ? Math.ceil(hours / 8) : "",
      作業状況: row["納期判定"] === "納品済" ? "完了" : "作成中",
      完了: row["納期判定"] === "納品済",
      進捗工程: steps,
      見積PDF名: "",
      見積読込内容: "",
      作業内容進捗報告: "",
    };
    return { ...item, 納期判定: statusFor(item) };
  });
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
  const [cases, setCases] = useState<CaseRecord[]>(asObjects(data.cases) as CaseRecord[]);
  const [processItems, setProcessItems] = useState<ProcessItem[]>(initialProcessItems());
  const [processSteps, setProcessSteps] = useState(defaultSteps);
  const [selectedProcess, setSelectedProcess] = useState<ProcessItem | null>(null);
  const [form, setForm] = useState<CaseRecord>(initialForm);
  const [message, setMessage] = useState("");
  const [processMessage, setProcessMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessSaving, setIsProcessSaving] = useState(false);

  useEffect(() => {
    fetch("/api/cases")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.cases) setCases(payload.cases);
      })
      .catch(() => undefined);

    fetch("/api/process")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.items) setProcessItems(payload.items);
        if (payload?.steps) setProcessSteps(payload.steps);
      })
      .catch(() => undefined);
  }, []);

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
  const weeks = weekStarts(processItems);
  const processHeaders = [
    "NO",
    "会社名",
    "作業内容",
    "作業時間",
    "作業日数",
    "作業状況",
    "作業開始",
    "最終納品予定",
    "進捗工程",
    "納期判定",
  ];

  function updateForm(key: string, value: string) {
    const next = { ...form, [key]: value };
    if (key === "税抜単価" || key === "個数") {
      const subtotal = (Number(next["税抜単価"]) || 0) * (Number(next["個数"]) || 0);
      next["税抜金額"] = subtotal || "";
      next["消費税"] = subtotal ? Math.round(subtotal * 0.1) : "";
      next["アポ金額"] = subtotal || "";
      next["申込金額"] = subtotal ? Math.round(subtotal * 1.1) : "";
    }
    setForm(next);
  }

  function updateSelected(key: string, value: string | boolean | string[]) {
    if (!selectedProcess) return;
    const next = { ...selectedProcess, [key]: value };
    next["作業日数"] = calcDays(next["作業時間"]);
    next["作業状況"] = next["完了"] === true ? "完了" : "作成中";
    next["納期判定"] = statusFor(next);
    setSelectedProcess(next);
  }

  function toggleStep(step: string) {
    const current = Array.isArray(selectedProcess?.["進捗工程"])
      ? (selectedProcess?.["進捗工程"] as string[])
      : [];
    const next = current.includes(step)
      ? current.filter((item) => item !== step)
      : [...current, step];
    updateSelected("進捗工程", next);
  }

  async function readQuotePdf(file: File) {
    setProcessMessage("PDFを読み込んでいます。");
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: true }).promise;
    const pages: string[] = [];

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      pages.push(content.items.map((item: any) => item.str || "").join(" "));
    }

    const text = pages.join("\n").trim();
    const hours = estimateHours(text);
    const content = extractWorkContent(text);
    updateSelected("見積PDF名", file.name);
    updateSelected("見積読込内容", text);
    if (content) updateSelected("作業内容", content);
    if (hours) updateSelected("作業時間", String(hours));
    setProcessMessage("PDFから作業内容を読み込みました。");
  }

  async function addCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form["会社名"] && !form["代表"]) {
      setMessage("会社名または代表を入力してください。");
      return;
    }

    setIsSaving(true);
    setMessage("");
    const payload = Object.fromEntries(caseHeaders.map((header) => [header, form[header] ?? ""]));
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case: payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存できませんでした。");
      setCases((current) => [...current, result.case]);
      setForm(initialForm);
      setMessage("新規案件を追加しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProcess() {
    if (!selectedProcess) return;
    setIsProcessSaving(true);
    setProcessMessage("");
    try {
      const response = await fetch("/api/process", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: selectedProcess }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存できませんでした。");
      setProcessItems((current) =>
        current.map((item) => (item.id === result.item.id ? result.item : item)),
      );
      setSelectedProcess(result.item);
      setProcessMessage("工程を保存しました。");
    } catch (error) {
      setProcessMessage(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setIsProcessSaving(false);
    }
  }

  return (
    <main>
      <header>
        <div>
          <h1>NSL実績管理アプリ</h1>
          <p>案件追加、売上、担当者別実績、会社別工程を確認できます。</p>
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
        <>
          <Panel title="新規案件追加">
            <form className="case-form" onSubmit={addCase}>
              <Field label="会社名" onChange={updateForm} value={form["会社名"]} />
              <Field label="代表" onChange={updateForm} value={form["代表"]} />
              <Field label="アポ日" onChange={updateForm} type="date" value={form["アポ日"]} />
              <Field label="申込日" onChange={updateForm} type="date" value={form["申込日"]} />
              <Field label="入金日" onChange={updateForm} type="date" value={form["入金日"]} />
              <SelectField label="営業" onChange={updateForm} options={["浅野", "鹿島", "川西", ""]} value={form["営業"]} />
              <SelectField label="開発" onChange={updateForm} options={["鹿島", "川西", "浅野", ""]} value={form["開発"]} />
              <SelectField label="サブ" onChange={updateForm} options={["", "鹿島", "川西", "浅野"]} value={form["サブ"]} />
              <SelectField label="申込状況" onChange={updateForm} options={["", "済"]} value={form["申込状況"]} />
              <SelectField label="入金状況" onChange={updateForm} options={["", "済"]} value={form["入金状況"]} />
              <Field label="サービス" onChange={updateForm} value={form["サービス"]} />
              <Field label="税抜単価" onChange={updateForm} type="number" value={form["税抜単価"]} />
              <Field label="個数" onChange={updateForm} type="number" value={form["個数"]} />
              <Field label="申込金額" onChange={updateForm} type="number" value={form["申込金額"]} />
              <Field label="入金金額" onChange={updateForm} type="number" value={form["入金金額"]} />
              <div className="form-actions">
                <button disabled={isSaving} type="submit">
                  {isSaving ? "保存中" : "案件追加"}
                </button>
                {message && <span className="message">{message}</span>}
              </div>
            </form>
          </Panel>

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
                headers={caseHeaders}
                rows={filteredCases.map((row) => caseHeaders.map((header) => row[header] ?? ""))}
              />
            </div>
          </Panel>
        </>
      )}

      {view === "process" && (
        <Panel action={<span className="note">会社名・納期判定をクリックすると詳細を確認できます</span>} title="会社別工程">
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
                {processItems.map((row) => {
                  const start = dateValue(row["作業開始"]);
                  const due = dateValue(row["最終納品予定"]);
                  const status = statusFor(row);
                  return (
                    <tr key={String(row.id)}>
                      {processHeaders.map((header) => (
                        <td key={header}>
                          {header === "会社名" ? (
                            <button className="link-button" onClick={() => setSelectedProcess(row)} type="button">
                              {String(row[header] || "")}
                            </button>
                          ) : header === "納期判定" ? (
                            <button className="plain-button" onClick={() => setSelectedProcess(row)} type="button">
                              <span className={`status ${statusClass(status)}`}>{status}</span>
                            </button>
                          ) : header === "進捗工程" ? (
                            Array.isArray(row["進捗工程"]) ? row["進捗工程"].join(" / ") : ""
                          ) : (
                            String(row[header] ?? "")
                          )}
                        </td>
                      ))}
                      {weeks.map((week) => {
                        const end = new Date(week);
                        end.setDate(end.getDate() + 6);
                        const active = start && due && week <= due && end >= start;
                        return (
                          <td className="barcell" key={week.toISOString()}>
                            {active && <span className={`bar ${statusClass(status)}`} />}
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

      {selectedProcess && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal">
            <div className="modal-head">
              <div>
                <h2>{String(selectedProcess["会社名"] || "")}</h2>
                <p className="note">現在の納期判定: {statusFor(selectedProcess)}</p>
              </div>
              <button className="secondary" onClick={() => setSelectedProcess(null)} type="button">
                閉じる
              </button>
            </div>

            <div className="detail-grid">
              <label className="wide">
                <span>進捗工程</span>
                <div className="step-grid">
                  {processSteps.map((step) => {
                    const checked = Array.isArray(selectedProcess["進捗工程"])
                      ? selectedProcess["進捗工程"].includes(step)
                      : false;
                    return (
                      <label className="check-line" key={step}>
                        <input checked={checked} onChange={() => toggleStep(step)} type="checkbox" />
                        {step}
                      </label>
                    );
                  })}
                </div>
              </label>

              <label className="wide">
                <span>作業内容</span>
                <textarea
                  onChange={(event) => updateSelected("作業内容", event.target.value)}
                  rows={4}
                  value={String(selectedProcess["作業内容"] || "")}
                />
              </label>

              <label>
                <span>作業時間</span>
                <input
                  min="0"
                  onChange={(event) => updateSelected("作業時間", event.target.value)}
                  type="number"
                  value={String(selectedProcess["作業時間"] || "")}
                />
              </label>
              <label>
                <span>作業日数</span>
                <input readOnly value={String(calcDays(selectedProcess["作業時間"]) || "")} />
              </label>
              <label>
                <span>作業開始</span>
                <input
                  onChange={(event) => updateSelected("作業開始", event.target.value)}
                  type="date"
                  value={String(selectedProcess["作業開始"] || "")}
                />
              </label>
              <label>
                <span>納期入力</span>
                <input
                  onChange={(event) => updateSelected("最終納品予定", event.target.value)}
                  type="date"
                  value={String(selectedProcess["最終納品予定"] || "")}
                />
              </label>

              <label>
                <span>作業状態</span>
                <div className="status-toggles">
                  <label className="check-line">
                    <input
                      checked={selectedProcess["完了"] !== true}
                      onChange={() => updateSelected("完了", false)}
                      type="checkbox"
                    />
                    作成中
                  </label>
                  <label className="check-line">
                    <input
                      checked={selectedProcess["完了"] === true}
                      onChange={() => updateSelected("完了", true)}
                      type="checkbox"
                    />
                    完了
                  </label>
                </div>
              </label>

              <label className="wide">
                <span>見積PDF読込</span>
                <input
                  accept="application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void readQuotePdf(file);
                  }}
                  type="file"
                />
                {selectedProcess["見積PDF名"] && (
                  <span className="note">読込済み: {String(selectedProcess["見積PDF名"])}</span>
                )}
              </label>

              <label className="wide">
                <span>PDF読込内容</span>
                <textarea
                  onChange={(event) => updateSelected("見積読込内容", event.target.value)}
                  rows={4}
                  value={String(selectedProcess["見積読込内容"] || "")}
                />
              </label>

              <label className="wide">
                <span>作業内容進捗報告</span>
                <textarea
                  onChange={(event) => updateSelected("作業内容進捗報告", event.target.value)}
                  rows={4}
                  value={String(selectedProcess["作業内容進捗報告"] || "")}
                />
              </label>
            </div>

            <div className="form-actions modal-actions">
              <button disabled={isProcessSaving} onClick={saveProcess} type="button">
                {isProcessSaving ? "保存中" : "工程を保存"}
              </button>
              {processMessage && <span className="message">{processMessage}</span>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function estimateHours(text: string) {
  const hourMatches = [...text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(?:時間|h|H)/g)];
  if (hourMatches.length) {
    return hourMatches.reduce((sum, match) => sum + Number(match[1]), 0);
  }
  const dayMatches = [...text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*日/g)];
  if (dayMatches.length) {
    return dayMatches.reduce((sum, match) => sum + Number(match[1]) * 8, 0);
  }
  return 0;
}

function extractWorkContent(text: string) {
  return text
    .split(/\n|。/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3)
    .slice(0, 8)
    .join(" / ");
}

function Field({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (key: string, value: string) => void;
  type?: string;
  value: string | number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        onChange={(event) => onChange(label, event.target.value)}
        type={type}
        value={String(value ?? "")}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (key: string, value: string) => void;
  options: string[];
  value: string | number;
}) {
  return (
    <label>
      <span>{label}</span>
      <select onChange={(event) => onChange(label, event.target.value)} value={String(value ?? "")}>
        {options.map((option) => (
          <option key={option || "blank"} value={option}>
            {option || "未設定"}
          </option>
        ))}
      </select>
    </label>
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
