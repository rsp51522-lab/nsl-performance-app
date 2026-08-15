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
type CsvRow = (string | number)[];
type CsvFile = { name: string; rows: CsvRow[] };

const data = seed as AppData;
const rewardRateHeaders = ["営業報酬率", "開発報酬率", "サブ報酬率"];
const caseHeaders = [...data.cases.headers, ...rewardRateHeaders];
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
const staffOptions = ["", "浅野", "鹿島", "川西"];
const exportStaff = ["浅野", "鹿島", "川西"];
const exportMonths = [6, 7, 8, 9, 10, 11, 12];
const rateHeaders = new Set(rewardRateHeaders);
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
  "浅野報酬",
  "鹿島報酬",
  "川西報酬",
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
  営業報酬率: 30,
  開発報酬率: 70,
  サブ報酬率: 35,
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

function isInMonth(value: string | number, year: number, month: number) {
  const date = dateValue(value);
  return !!date && date.getFullYear() === year && date.getMonth() + 1 === month;
}

function calcDays(hours: string | number | boolean | string[]) {
  const value = Number(hours) || 0;
  return value ? Math.ceil(value / 8) : "";
}

function defaultRewardRate(row: CaseRecord, role: "sales" | "developer" | "sub", name: string) {
  if (role === "sales") return name === "浅野" ? 0.3 : 1;
  if (role === "developer") {
    if (name === "鹿島") return row["サブ"] ? 0.35 : 0.7;
    if (name === "川西") return 0.35;
    return 0;
  }
  return 0.35;
}

function rewardRate(
  row: CaseRecord,
  key: "営業報酬率" | "開発報酬率" | "サブ報酬率",
  fallback: number,
) {
  const raw = row[key];
  if (raw === "" || raw === undefined || raw === null) return fallback;
  const value = Number(String(raw).replace("%", ""));
  return Number.isFinite(value) ? value / 100 : fallback;
}

function staffApplicationReward(row: CaseRecord, name: string) {
  const amount = Number(row["税抜金額"]) || 0;
  let reward = 0;

  if (row["営業"] === name) {
    reward += amount * rewardRate(row, "営業報酬率", defaultRewardRate(row, "sales", name));
  }
  if (row["開発"] === name) {
    reward += amount * rewardRate(row, "開発報酬率", defaultRewardRate(row, "developer", name));
  }
  if (row["サブ"] === name) {
    reward += amount * rewardRate(row, "サブ報酬率", defaultRewardRate(row, "sub", name));
  }

  return Math.round(reward);
}

function staffPaidReward(row: CaseRecord, name: string) {
  const paid = Number(row["入金金額"]) || 0;
  let reward = 0;

  if (row["営業"] === name) {
    reward += paid * rewardRate(row, "営業報酬率", defaultRewardRate(row, "sales", name));
  }
  if (row["開発"] === name) {
    reward += paid * rewardRate(row, "開発報酬率", defaultRewardRate(row, "developer", name));
  }
  if (row["サブ"] === name) {
    reward += paid * rewardRate(row, "サブ報酬率", defaultRewardRate(row, "sub", name));
  }

  return Math.round(reward);
}

function assignedTo(row: CaseRecord, name: string) {
  return row["営業"] === name || row["開発"] === name || row["サブ"] === name;
}

function hasApplication(row: CaseRecord) {
  return row["申込状況"] === "済" || !!row["申込日"];
}

function hasPayment(row: CaseRecord) {
  return row["入金状況"] === "済" || !!row["入金日"] || Number(row["入金金額"]) > 0;
}

function taxIncluded(row: CaseRecord, preferredKey: string) {
  const preferred = Number(row[preferredKey]) || 0;
  if (preferred) return Math.round(preferred);
  const subtotal = Number(row["税抜金額"]) || (Number(row["税抜単価"]) || 0) * (Number(row["個数"]) || 0);
  return subtotal ? Math.round(subtotal * 1.1) : 0;
}

function normalizeCompanyName(value: string | number | boolean | string[] | undefined) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[ \t\r\n　]/g, "")
    .replace(/株式会社|有限会社|\(株\)|（株）|御中|様/g, "")
    .toLowerCase();
}

function uniqueList(value: unknown, separatorPattern = /[,、/／]+/) {
  return String(value || "")
    .split(separatorPattern)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinUnique(current: unknown, next: unknown, separator = " / ", separatorPattern = /[/／]+/) {
  const values = [...uniqueList(current, separatorPattern), ...uniqueList(next, separatorPattern)];
  return [...new Set(values)].join(separator);
}

function mergeDate(current: unknown, next: unknown, direction: "min" | "max") {
  const currentDate = dateValue(String(current || ""));
  const nextDate = dateValue(String(next || ""));
  if (!currentDate) return next || "";
  if (!nextDate) return current || "";
  const selected =
    direction === "min"
      ? currentDate <= nextDate
        ? currentDate
        : nextDate
      : currentDate >= nextDate
        ? currentDate
        : nextDate;
  return selected.toISOString().slice(0, 10);
}

function mergeCompanyProcess(base: ProcessItem, next: ProcessRecord) {
  const merged: ProcessItem = { ...base };
  merged["NO"] = joinUnique(merged["NO"], next["NO"], ", ", /[,、]+/);
  merged["作業内容"] = joinUnique(merged["作業内容"], next["作業内容"], " / ", /[/／]+/);
  merged["作業時間"] = (Number(merged["作業時間"]) || 0) + (Number(next["作業時間"]) || 0) || "";
  merged["作業日数"] = calcDays(merged["作業時間"]);
  merged["作業開始"] = mergeDate(merged["作業開始"], next["作業開始"], "min");
  merged["最終納品予定"] = mergeDate(merged["最終納品予定"], next["最終納品予定"], "max");
  merged["作業終了"] = mergeDate(merged["作業終了"], next["作業終了"], "max");
  if (!merged["営業"] && next["営業"]) merged["営業"] = next["営業"];
  if (!merged["開発"] && next["開発"]) merged["開発"] = next["開発"];
  if (!merged["サブ"] && next["サブ"]) merged["サブ"] = next["サブ"];
  merged["納期判定"] = statusFor(merged);
  return merged;
}

function processSortValue(row: ProcessRecord) {
  const maxNo = Math.max(0, ...uniqueList(row["NO"], /[,、]+/).map((no) => Number(no) || 0));
  if (maxNo) return maxNo;
  const dates = [row["作業開始"], row["最終納品予定"], row["作業終了"]]
    .map((value) => dateValue(value)?.getTime() || 0)
    .filter(Boolean);
  return dates.length ? Math.max(...dates) / 86400000 : 0;
}

function processForCase(row: CaseRecord, processItems: ProcessItem[]) {
  const no = String(row["NO"] || "").trim();
  return (
    processItems.find((item) =>
      String(item["NO"] || "")
        .split(",")
        .map((value) => value.trim())
        .includes(no),
    ) ||
    processItems.find(
      (item) => normalizeCompanyName(item["会社名"]) === normalizeCompanyName(row["会社名"]),
    )
  );
}

function deliveryDateFor(row: CaseRecord, processItems: ProcessItem[]) {
  const process = processForCase(row, processItems);
  return String(process?.["作業終了"] || process?.["最終納品予定"] || "");
}

function rowTouchesMonth(row: CaseRecord, year: number, month: number) {
  return (
    isInMonth(row["アポ日"], year, month) ||
    isInMonth(row["申込日"], year, month) ||
    isInMonth(row["入金日"], year, month)
  );
}

function detailCsvRows(rows: CaseRecord[], processItems: ProcessItem[]): CsvRow[] {
  const headers = [
    "会社名",
    "代表名",
    "営業",
    "開発",
    "サブ",
    "受付日",
    "受付内容",
    "受付数",
    "受付単価",
    "受付料金税込",
    "申込日",
    "申込内容",
    "申込数",
    "申込単価",
    "申込料金税込",
    "契約日",
    "納品日",
    "入金日",
    "入金料金税込",
  ];

  return [
    headers,
    ...rows.map((row) => [
      row["会社名"] || "",
      row["代表"] || "",
      row["営業"] || "",
      row["開発"] || "",
      row["サブ"] || "",
      row["アポ日"] || "",
      row["サービス"] || "",
      row["個数"] || "",
      row["税抜単価"] || "",
      taxIncluded(row, "アポ金額"),
      row["申込日"] || "",
      row["サービス"] || "",
      row["個数"] || "",
      row["税抜単価"] || "",
      taxIncluded(row, "申込金額"),
      row["申込日"] || "",
      deliveryDateFor(row, processItems),
      row["入金日"] || "",
      row["入金金額"] || "",
    ]),
  ];
}

function summaryRows(title: string, rows: CaseRecord[], processItems: ProcessItem[]): CsvRow[] {
  const current = new Date();
  const currentYear = current.getFullYear();
  const currentMonth = current.getMonth() + 1;
  const yearRows = rows.filter((row) => {
    const keys = ["アポ日", "申込日", "入金日"];
    return keys.some((key) => {
      const date = dateValue(row[key]);
      return date?.getFullYear() === currentYear;
    });
  });
  const monthRows = rows.filter((row) => rowTouchesMonth(row, currentYear, currentMonth));

  const csvRows: CsvRow[] = [
    [title],
    [],
    ["全体年間売上", yearRows.reduce((sum, row) => sum + (Number(row["入金金額"]) || 0), 0)],
    ["年間申込数", yearRows.filter(hasApplication).length],
    ["年間契約数", yearRows.filter(hasApplication).length],
    [],
    ["担当者", "個人年間売上", "年間申込数", "年間契約数"],
    ...exportStaff.map((name) => [
      name,
      yearRows.reduce((sum, row) => sum + (assignedTo(row, name) ? staffPaidReward(row, name) : 0), 0),
      yearRows.filter((row) => assignedTo(row, name) && hasApplication(row)).length,
      yearRows.filter((row) => assignedTo(row, name) && hasApplication(row)).length,
    ]),
    [],
    ["今月売上", monthRows.reduce((sum, row) => sum + (Number(row["入金金額"]) || 0), 0)],
    ["今月申込数", monthRows.filter(hasApplication).length],
    ["今月契約数", monthRows.filter(hasApplication).length],
    [],
    ["明細"],
    ...detailCsvRows(rows, processItems),
  ];

  return csvRows;
}

function monthlyCsvRows(year: number, month: number, rows: CaseRecord[], processItems: ProcessItem[]): CsvRow[] {
  const monthRows = rows.filter((row) => rowTouchesMonth(row, year, month));
  return [
    [`${year}.${month} 実績シート`],
    [],
    ["担当者", "個人今月売上", "申込数", "契約数", "入金数"],
    ...exportStaff.map((name) => [
      name,
      monthRows.reduce((sum, row) => sum + (assignedTo(row, name) ? staffPaidReward(row, name) : 0), 0),
      monthRows.filter((row) => assignedTo(row, name) && hasApplication(row)).length,
      monthRows.filter((row) => assignedTo(row, name) && hasApplication(row)).length,
      monthRows.filter((row) => assignedTo(row, name) && hasPayment(row)).length,
    ]),
    [],
    ["明細"],
    ...detailCsvRows(monthRows, processItems),
  ];
}

function buildCsvFiles(rows: CaseRecord[], processItems: ProcessItem[]) {
  return [
    { name: "NSL_全体実績.csv", rows: summaryRows("全体実績シート", rows, processItems) },
    ...exportMonths.map((month) => ({
      name: `NSL_2026.${month}実績.csv`,
      rows: monthlyCsvRows(2026, month, rows, processItems),
    })),
  ];
}

function csvText(rows: CsvRow[]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\r\n");
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

function shortDate(value: string | number | boolean | string[]) {
  const date = dateValue(value);
  return date ? `${date.getMonth() + 1}/${date.getDate()}` : "";
}

function processHeaderLabel(header: string) {
  const labels: Record<string, string> = {
    作業開始: "開始",
    最終納品予定: "納品",
    作業時間: "時間",
    作業日数: "日数",
  };
  return labels[header] || header;
}

function processColumnClass(header: string) {
  if (header === "会社名") return "company-col";
  if (header === "納期判定") return "status-col";
  if (["営業", "開発", "サブ"].includes(header)) return "staff-col";
  if (["作業開始", "最終納品予定"].includes(header)) return "date-field-col";
  if (["作業時間", "作業日数"].includes(header)) return "number-col";
  return "";
}

function graphWeeks() {
  const today = new Date();
  const min = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const max = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const weeks: { start: Date; end: Date }[] = [];
  const firstEnd = new Date(min);
  firstEnd.setDate(firstEnd.getDate() + ((7 - firstEnd.getDay()) % 7));
  weeks.push({ start: new Date(min), end: firstEnd > max ? new Date(max) : firstEnd });
  const next = new Date(firstEnd);
  next.setDate(next.getDate() + 1);
  for (const date = next; date <= max; date.setDate(date.getDate() + 7)) {
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    weeks.push({ start: new Date(date), end: end > max ? new Date(max) : end });
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
          <tr className={row[0] === "合計" ? "total-row" : ""} key={rowIndex}>
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
  const [processFilter, setProcessFilter] = useState({
    keyword: "",
    staff: "",
    status: "",
    workStatus: "",
  });
  const [cases, setCases] = useState<CaseRecord[]>(asObjects(data.cases) as CaseRecord[]);
  const [processItems, setProcessItems] = useState<ProcessItem[]>(initialProcessItems());
  const [processSteps, setProcessSteps] = useState(defaultSteps);
  const [selectedProcess, setSelectedProcess] = useState<ProcessItem | null>(null);
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [form, setForm] = useState<CaseRecord>(initialForm);
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [message, setMessage] = useState("");
  const [processMessage, setProcessMessage] = useState("");
  const [csvMessage, setCsvMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCaseEditSaving, setIsCaseEditSaving] = useState(false);
  const [isCaseDeleting, setIsCaseDeleting] = useState(false);
  const [isProcessSaving, setIsProcessSaving] = useState(false);
  const [isProcessDeleting, setIsProcessDeleting] = useState(false);
  const [isCsvSaving, setIsCsvSaving] = useState(false);
  const [isRewardAdmin, setIsRewardAdmin] = useState(false);
  const [rewardLogin, setRewardLogin] = useState({ id: "", password: "" });
  const [rewardLoginMessage, setRewardLoginMessage] = useState("");

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

    fetch("/api/reward-auth")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.authenticated) setIsRewardAdmin(true);
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
    const rows = ["浅野", "鹿島", "川西", "未設定"].map((name) => {
      let appCount = 0;
      let payCount = 0;
      let app = 0;
      let pay = 0;
      let dev = 0;
      let sub = 0;

      for (const row of cases) {
        const paid = Number(row["入金金額"]) || 0;
        const isSales = row["営業"] === name;
        const isDeveloper = row["開発"] === name;
        const isSub = row["サブ"] === name;
        const salesRate = isSales
          ? rewardRate(row, "営業報酬率", defaultRewardRate(row, "sales", name))
          : 0;
        const devRate = isDeveloper
          ? rewardRate(row, "開発報酬率", defaultRewardRate(row, "developer", name))
          : 0;
        const subRate = isSub
          ? rewardRate(row, "サブ報酬率", defaultRewardRate(row, "sub", name))
          : 0;

        if (isSales || isDeveloper || isSub) {
          if (row["申込状況"] === "済") appCount += 1;
          if (row["入金状況"] === "済") payCount += 1;
        }

        if (isSales) {
          app += staffApplicationReward(row, name);
          pay += paid * salesRate;
        }
        if (isDeveloper) {
          if (!isSales) app += staffApplicationReward(row, name);
          pay += paid * devRate;
          dev += 1;
        }
        if (isSub) {
          if (!isSales && !isDeveloper) app += staffApplicationReward(row, name);
          pay += paid * subRate;
          sub += 1;
        }
      }
      return [name, appCount, app, payCount, pay, dev, sub];
    });

    return [
      ...rows,
      [
        "合計",
        rows.reduce((sum, row) => sum + Number(row[1] || 0), 0),
        rows.reduce((sum, row) => sum + Number(row[2] || 0), 0),
        rows.reduce((sum, row) => sum + Number(row[3] || 0), 0),
        rows.reduce((sum, row) => sum + Number(row[4] || 0), 0),
        rows.reduce((sum, row) => sum + Number(row[5] || 0), 0),
        rows.reduce((sum, row) => sum + Number(row[6] || 0), 0),
      ],
    ];
  }, [cases]);

  const rewardDetailRows = useMemo(() => {
    const rows = cases
      .filter((row) => row["会社名"] || row["サービス"] || Number(row["税抜金額"]))
      .map((row) => [
        row["会社名"] || "",
        row["サービス"] || "",
        row["税抜金額"] || 0,
        row["営業"] || "",
        row["開発"] || "",
        row["サブ"] || "",
        staffApplicationReward(row, "浅野"),
        staffApplicationReward(row, "鹿島"),
        staffApplicationReward(row, "川西"),
      ]);

    return [
      ...rows,
      [
        "合計",
        "",
        rows.reduce((sum, row) => sum + Number(row[2] || 0), 0),
        "",
        "",
        "",
        rows.reduce((sum, row) => sum + Number(row[6] || 0), 0),
        rows.reduce((sum, row) => sum + Number(row[7] || 0), 0),
        rows.reduce((sum, row) => sum + Number(row[8] || 0), 0),
      ],
    ];
  }, [cases]);

  const filteredCases = cases
    .filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (Number(b["NO"]) || 0) - (Number(a["NO"]) || 0));
  const visibleCaseHeaders = useMemo(
    () => (isRewardAdmin ? caseHeaders : caseHeaders.filter((header) => !rateHeaders.has(header))),
    [isRewardAdmin],
  );
  const paidCaseKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of cases) {
      if (row["入金状況"] !== "済" && !(Number(row["入金金額"]) > 0)) continue;
      if (row["NO"]) keys.add(`no:${row["NO"]}`);
      const companyKey = normalizeCompanyName(row["会社名"]);
      if (companyKey) keys.add(`company:${companyKey}`);
    }
    return keys;
  }, [cases]);
  const currentCompanyByNo = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of cases) {
      const no = String(row["NO"] || "").trim();
      const companyKey = normalizeCompanyName(row["会社名"]);
      if (no && companyKey) map.set(no, companyKey);
    }
    return map;
  }, [cases]);
  const currentCompanies = useMemo(() => {
    const keys = new Set<string>();
    for (const row of cases) {
      const companyKey = normalizeCompanyName(row["会社名"]);
      if (companyKey) keys.add(companyKey);
    }
    return keys;
  }, [cases]);
  const groupedProcessItems = useMemo(() => {
    const groups = new Map<string, ProcessItem>();

    for (const row of processItems) {
      const companyKey = normalizeCompanyName(row["会社名"]) || `process:${row.id ?? row["NO"]}`;
      const rawNos = uniqueList(row["NO"], /[,、]+/);
      const validNos = rawNos.filter((no) => {
        const currentCompany = currentCompanyByNo.get(no);
        return !currentCompany || currentCompany === companyKey;
      });
      if (rawNos.length > 0 && validNos.length === 0 && !currentCompanies.has(companyKey)) {
        continue;
      }
      const cleanRow = {
        ...row,
        NO: rawNos.length > 0 ? validNos.join(", ") : row["NO"],
      };
      const current = groups.get(companyKey);
      groups.set(companyKey, current ? mergeCompanyProcess(current, cleanRow) : { ...cleanRow });
    }

    for (const row of cases) {
      const companyKey = normalizeCompanyName(row["会社名"]);
      if (!companyKey) continue;
      const caseProcess: ProcessRecord = {
        NO: row["NO"] || "",
        会社名: row["会社名"] || "",
        作業内容: row["サービス"] || "",
        作業時間: "",
        作業日数: "",
        作業状況: "作成中",
        営業: row["営業"] || "",
        開発: row["開発"] || "",
        サブ: row["サブ"] || "",
        作業開始: "",
        最終納品予定: "",
        進捗工程: row["申込状況"] === "済" ? ["申込"] : [],
        納期判定: "未設定",
      };
      const current = groups.get(companyKey);
      groups.set(
        companyKey,
        current
          ? mergeCompanyProcess(current, caseProcess)
          : { ...caseProcess },
      );
    }

    return [...groups.values()].sort((a, b) => processSortValue(b) - processSortValue(a));
  }, [cases, currentCompanies, currentCompanyByNo, processItems]);
  const filteredProcessItems = groupedProcessItems.filter((row) => {
    const text = JSON.stringify(row).toLowerCase();
    const keyword = processFilter.keyword.toLowerCase();
    const status = statusFor(row);
    const staffMatched =
      !processFilter.staff ||
      row["営業"] === processFilter.staff ||
      row["開発"] === processFilter.staff ||
      row["サブ"] === processFilter.staff;
    return (
      (!keyword || text.includes(keyword)) &&
      staffMatched &&
      (!processFilter.status || status === processFilter.status) &&
      (!processFilter.workStatus || row["作業状況"] === processFilter.workStatus)
    );
  });
  const weeks = graphWeeks();
  const processHeaders = [
    "会社名",
    "納期判定",
    "営業",
    "開発",
    "サブ",
    "作業開始",
    "最終納品予定",
    "作業時間",
    "作業日数",
  ];

  function updateCaseRecord(record: CaseRecord, key: string, value: string) {
    const next = { ...record, [key]: value };
    if (key === "税抜単価" || key === "個数") {
      const subtotal = (Number(next["税抜単価"]) || 0) * (Number(next["個数"]) || 0);
      next["税抜金額"] = subtotal || "";
      next["消費税"] = subtotal ? Math.round(subtotal * 0.1) : "";
      next["アポ金額"] = subtotal || "";
      next["申込金額"] = subtotal ? Math.round(subtotal * 1.1) : "";
    }
    return next;
  }

  function updateForm(key: string, value: string) {
    setForm((current) => updateCaseRecord(current, key, value));
  }

  function updateEditingCase(key: string, value: string) {
    setEditingCase((current) => (current ? updateCaseRecord(current, key, value) : current));
  }

  function openCaseEdit(row: CaseRecord) {
    setEditingCase({ ...initialForm, ...row });
    setShowCaseForm(false);
    setMessage("");
  }

  async function loginRewardAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRewardLoginMessage("");
    try {
      const response = await fetch("/api/reward-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rewardLogin),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ログインできませんでした。");
      setIsRewardAdmin(true);
      setRewardLogin({ id: "", password: "" });
      setRewardLoginMessage("報酬率を変更できます。");
    } catch (error) {
      setIsRewardAdmin(false);
      setRewardLoginMessage(error instanceof Error ? error.message : "ログインできませんでした。");
    }
  }

  async function logoutRewardAdmin() {
    await fetch("/api/reward-auth", { method: "DELETE" }).catch(() => undefined);
    setIsRewardAdmin(false);
    setRewardLoginMessage("報酬率変更を終了しました。");
  }

  function updateSelected(key: string, value: string | boolean | string[]) {
    if (!selectedProcess) return;
    updateSelectedPatch({ [key]: value });
  }

  function updateSelectedPatch(patch: Partial<ProcessItem>) {
    if (!selectedProcess) return;
    const next = { ...selectedProcess, ...patch };
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
    try {
      const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      const pages: string[] = [];

      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        const content = await page.getTextContent();
        pages.push(content.items.map((item: any) => item.str || "").join(" "));
      }

      const extracted = pages.join("\n").trim();
      const quoteItems = extractQuoteItems(extracted);
      const quoteSummary = formatQuoteItems(quoteItems);
      const text =
        quoteSummary ||
        (extracted
          ? "商品名・単位・数量を自動抽出できませんでした。必要に応じて手入力してください。"
          : "") ||
        `PDFを添付しました: ${file.name}\nこのPDFからは文字を自動抽出できませんでした。画像PDFの場合は、作業内容を手入力してください。`;
      const hours = estimateHours(extracted);
      const content = quoteItems.length
        ? quoteItems.map((item) => item.name).join(" / ")
        : extractWorkContent(extracted);
      updateSelectedPatch({
        見積PDF名: file.name,
        見積読込内容: text,
        ...(content ? { 作業内容: content } : {}),
        ...(hours ? { 作業時間: String(hours) } : {}),
      });
      setProcessMessage(
        extracted
          ? "PDFから作業内容を読み込みました。"
          : "PDFは添付済みです。文字抽出できない形式のため、作業内容を手入力してください。",
      );
    } catch (error) {
      updateSelectedPatch({
        見積PDF名: file.name,
        見積読込内容: `PDFを添付しました: ${file.name}\n読み込み中にエラーが発生しました。必要に応じて作業内容を手入力してください。`,
      });
      setProcessMessage(
        error instanceof Error
          ? `PDF読込エラー: ${error.message}`
          : "PDF読込エラーが発生しました。",
      );
    }
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
      setShowCaseForm(false);
      setMessage("新規案件を追加しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCaseEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCase) return;
    const id = Number(editingCase.id);
    if (!id) {
      setMessage("案件データの読み込み後に修正してください。");
      return;
    }
    if (!editingCase["会社名"] && !editingCase["代表"]) {
      setMessage("会社名または代表を入力してください。");
      return;
    }

    setIsCaseEditSaving(true);
    setMessage("");
    const payload = {
      id,
      ...Object.fromEntries(caseHeaders.map((header) => [header, editingCase[header] ?? ""])),
    };

    try {
      const response = await fetch("/api/cases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case: payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存できませんでした。");
      setCases((current) =>
        current.map((item) => (item.id === result.case.id ? result.case : item)),
      );
      setEditingCase(null);
      setMessage("案件を修正しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      setIsCaseEditSaving(false);
    }
  }

  async function deleteEditingCase() {
    if (!editingCase) return;
    const id = Number(editingCase.id);
    if (!id) {
      setMessage("案件データの読み込み後に削除してください。");
      return;
    }

    const company = String(editingCase["会社名"] || editingCase["代表"] || `NO ${editingCase["NO"] || id}`);
    if (!window.confirm(`${company} の案件を削除します。よろしいですか？`)) return;

    setIsCaseDeleting(true);
    setMessage("");
    try {
      const response = await fetch("/api/cases", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "削除できませんでした。");
      setCases((current) => current.filter((item) => Number(item.id) !== id));
      setEditingCase(null);
      setMessage("案件を削除しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "削除できませんでした。");
    } finally {
      setIsCaseDeleting(false);
    }
  }

  async function saveCaseAssignment(row: CaseRecord, key: string, value: string) {
    if (rateHeaders.has(key) && !isRewardAdmin) {
      setMessage("報酬率の変更には管理者ログインが必要です。");
      return;
    }
    const id = Number(row.id);
    const next = { ...row, [key]: value };
    setCases((current) => current.map((item) => (item === row || item.id === row.id ? next : item)));
    setMessage("担当を保存しています。");

    if (!id) {
      setMessage("案件データの読み込み後に変更してください。");
      return;
    }

    try {
      const response = await fetch("/api/cases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case: next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存できませんでした。");
      setCases((current) =>
        current.map((item) => (item.id === result.case.id ? result.case : item)),
      );
      setMessage("担当を変更しました。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存できませんでした。");
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

  async function deleteSelectedProcess() {
    if (!selectedProcess) return;
    const companyKey = normalizeCompanyName(selectedProcess["会社名"]);
    const ids = processItems
      .filter((item) => normalizeCompanyName(item["会社名"]) === companyKey)
      .map((item) => Number(item.id))
      .filter(Boolean);
    const fallbackId = Number(selectedProcess.id);
    const deleteIds = ids.length ? ids : fallbackId ? [fallbackId] : [];

    if (!deleteIds.length) {
      setProcessMessage("削除できる工程データがありません。案件データは案件タブで削除してください。");
      return;
    }

    const company = String(selectedProcess["会社名"] || "この会社");
    if (!window.confirm(`${company} の工程データを削除します。よろしいですか？`)) return;

    setIsProcessDeleting(true);
    setProcessMessage("");
    try {
      const response = await fetch("/api/process", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "削除できませんでした。");
      const deleted = new Set((result.ids || deleteIds).map((id: number) => Number(id)));
      setProcessItems((current) => current.filter((item) => !deleted.has(Number(item.id))));
      setSelectedProcess(null);
      setProcessMessage("工程データを削除しました。");
    } catch (error) {
      setProcessMessage(error instanceof Error ? error.message : "削除できませんでした。");
    } finally {
      setIsProcessDeleting(false);
    }
  }

  function isPaidProcess(row: ProcessRecord) {
    const noValues = String(row["NO"] || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    return (
      noValues.some((no) => paidCaseKeys.has(`no:${no}`)) ||
      paidCaseKeys.has(`company:${normalizeCompanyName(row["会社名"])}`)
    );
  }

  function updateProcessFilter(key: keyof typeof processFilter, value: string) {
    setProcessFilter((current) => ({ ...current, [key]: value }));
  }

  async function saveCsvFiles() {
    setIsCsvSaving(true);
    setCsvMessage("");
    const files = buildCsvFiles(cases, processItems);
    const encoder = new TextEncoder();

    try {
      const picker = (window as unknown as {
        showDirectoryPicker?: () => Promise<{
          getFileHandle: (
            name: string,
            options: { create: boolean },
          ) => Promise<{ createWritable: () => Promise<{ write: (data: Uint8Array) => Promise<void>; close: () => Promise<void> }> }>;
        }>;
      }).showDirectoryPicker;

      if (picker) {
        const directory = await picker();
        for (const file of files) {
          const handle = await directory.getFileHandle(file.name, { create: true });
          const writable = await handle.createWritable();
          await writable.write(encoder.encode(`\uFEFF${csvText(file.rows)}`));
          await writable.close();
        }
        setCsvMessage("CSVを保存しました。Googleスプレッドシートへ取り込めます。");
        return;
      }

      for (const file of files) {
        const blob = new Blob([`\uFEFF${csvText(file.rows)}`], {
          type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
      setCsvMessage("CSVをダウンロードしました。保存先に移動してGoogleスプレッドシートへ取り込めます。");
    } catch (error) {
      setCsvMessage(error instanceof Error ? error.message : "CSV保存を中止しました。");
    } finally {
      setIsCsvSaving(false);
    }
  }

  return (
    <main>
      <header>
        <div>
          <h1>NSL実績管理アプリ</h1>
          <p>案件追加、売上、担当者別実績、会社別工程を確認できます。</p>
          <p className="version-note">最新版: 2026/08/15 11:58 案件・工程新しい順</p>
          {csvMessage && <p className="version-note">{csvMessage}</p>}
        </div>
        <div className="header-actions">
          <button onClick={() => void saveCsvFiles()} type="button" disabled={isCsvSaving}>
            {isCsvSaving ? "CSV保存中" : "CSVで保管"}
          </button>
          <a className="button" href={sheetUrl} rel="noreferrer" target="_blank">
            保存先を開く
          </a>
        </div>
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
          <section className="case-toolbar">
            <button
              onClick={() => {
                setShowCaseForm(true);
                setMessage("");
              }}
              type="button"
            >
              案件追加
            </button>
            {message && <span className="message">{message}</span>}
          </section>

          {showCaseForm && (
            <Panel
              action={
                <button
                  className="secondary"
                  onClick={() => setShowCaseForm(false)}
                  type="button"
                >
                  閉じる
                </button>
              }
              title="新規案件追加"
            >
              <form className="case-form" onSubmit={addCase}>
                <Field label="会社名" onChange={updateForm} value={form["会社名"]} />
                <Field label="代表" onChange={updateForm} value={form["代表"]} />
                <Field label="アポ日" onChange={updateForm} type="date" value={form["アポ日"]} />
                <Field label="申込日" onChange={updateForm} type="date" value={form["申込日"]} />
                <Field label="入金日" onChange={updateForm} type="date" value={form["入金日"]} />
                <SelectField label="営業" onChange={updateForm} options={["浅野", "鹿島", "川西", ""]} value={form["営業"]} />
                <SelectField label="開発" onChange={updateForm} options={["鹿島", "川西", "浅野", ""]} value={form["開発"]} />
                <SelectField label="サブ" onChange={updateForm} options={["", "鹿島", "川西", "浅野"]} value={form["サブ"]} />
                {isRewardAdmin && (
                  <>
                    <Field label="営業報酬率" onChange={updateForm} type="number" value={form["営業報酬率"]} />
                    <Field label="開発報酬率" onChange={updateForm} type="number" value={form["開発報酬率"]} />
                    <Field label="サブ報酬率" onChange={updateForm} type="number" value={form["サブ報酬率"]} />
                  </>
                )}
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
                </div>
              </form>
            </Panel>
          )}

          <section className="admin-panel">
            {isRewardAdmin ? (
              <>
                <span>報酬率変更: ログイン中</span>
                <button className="secondary" onClick={() => void logoutRewardAdmin()} type="button">
                  ログアウト
                </button>
              </>
            ) : (
              <form className="admin-login" onSubmit={loginRewardAdmin}>
                <span>報酬率変更ログイン</span>
                <input
                  autoComplete="username"
                  onChange={(event) =>
                    setRewardLogin((current) => ({ ...current, id: event.target.value }))
                  }
                  placeholder="ID"
                  value={rewardLogin.id}
                />
                <input
                  autoComplete="current-password"
                  onChange={(event) =>
                    setRewardLogin((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="パスワード"
                  type="password"
                  value={rewardLogin.password}
                />
                <button type="submit">ログイン</button>
              </form>
            )}
            {rewardLoginMessage && <span className="message">{rewardLoginMessage}</span>}
          </section>

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
              <table>
                <thead>
                  <tr>
                    <th>操作</th>
                    {visibleCaseHeaders.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((row, rowIndex) => (
                    <tr key={String(row.id || row["NO"] || rowIndex)}>
                      <td>
                        <button
                          className="table-action"
                          onClick={() => openCaseEdit(row)}
                          type="button"
                        >
                          修正
                        </button>
                      </td>
                      {visibleCaseHeaders.map((header) => (
                        <td
                          className={moneyHeaders.has(header) ? "money" : ""}
                          key={`${rowIndex}-${header}`}
                        >
                          {["営業", "開発", "サブ"].includes(header) ? (
                            <select
                              className="cell-select"
                              onChange={(event) => void saveCaseAssignment(row, header, event.target.value)}
                              value={String(row[header] ?? "")}
                            >
                              {staffOptions.map((option) => (
                                <option key={option || "blank"} value={option}>
                                  {option || "未設定"}
                                </option>
                              ))}
                            </select>
                          ) : rateHeaders.has(header) ? (
                            <input
                              className="cell-input rate-input"
                              inputMode="numeric"
                              min="0"
                              onChange={(event) =>
                                void saveCaseAssignment(row, header, event.target.value)
                              }
                              step="1"
                              type="number"
                              value={String(row[header] ?? "")}
                            />
                          ) : moneyHeaders.has(header) ? (
                            yen(row[header] ?? "")
                          ) : (
                            String(row[header] ?? "")
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      {view === "process" && (
        <Panel action={<span className="note">会社名・納期判定をクリックすると詳細を確認できます</span>} title="会社別工程">
          <div className="filter-bar">
            <input
              onChange={(event) => updateProcessFilter("keyword", event.target.value)}
              placeholder="会社名・作業内容で検索"
              value={processFilter.keyword}
            />
            <select
              onChange={(event) => updateProcessFilter("staff", event.target.value)}
              value={processFilter.staff}
            >
              <option value="">担当すべて</option>
              <option value="浅野">浅野</option>
              <option value="鹿島">鹿島</option>
              <option value="川西">川西</option>
            </select>
            <select
              onChange={(event) => updateProcessFilter("status", event.target.value)}
              value={processFilter.status}
            >
              <option value="">納期判定すべて</option>
              <option value="納品済">納品済</option>
              <option value="予定内">予定内</option>
              <option value="3日以内">3日以内</option>
              <option value="遅延">遅延</option>
              <option value="未設定">未設定</option>
            </select>
            <select
              onChange={(event) => updateProcessFilter("workStatus", event.target.value)}
              value={processFilter.workStatus}
            >
              <option value="">作業状況すべて</option>
              <option value="作成中">作成中</option>
              <option value="完了">完了</option>
            </select>
          </div>
          <div className="table-wrap">
            <table className="gantt">
              <thead>
                <tr>
                  {processHeaders.map((header) => (
                    <th className={processColumnClass(header)} key={header}>
                      {processHeaderLabel(header)}
                    </th>
                  ))}
                  {weeks.map((week) => (
                    <th className="date-col" key={week.start.toISOString()}>
                      {week.start.getMonth() + 1}/{week.start.getDate()}
                    </th>
                  ))}
                  <th className="work-status-col">作業状況</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcessItems.map((row) => {
                  const start = dateValue(row["作業開始"]);
                  const due = dateValue(row["最終納品予定"]);
                  const status = statusFor(row);
                  const paid = isPaidProcess(row);
                  return (
                    <tr key={`${String(row.id ?? "")}-${String(row["NO"] || "")}-${String(row["会社名"] || "")}`}>
                      {processHeaders.map((header) => (
                        <td className={processColumnClass(header)} key={header}>
                          {header === "会社名" ? (
                            <button className="link-button" onClick={() => setSelectedProcess(row)} type="button">
                              {String(row[header] || "")}
                            </button>
                          ) : header === "納期判定" ? (
                            <button className="plain-button" onClick={() => setSelectedProcess(row)} type="button">
                              <span className={`status ${statusClass(status)}`}>{status}</span>
                            </button>
                          ) : header === "作業開始" || header === "最終納品予定" ? (
                            shortDate(row[header])
                          ) : header === "進捗工程" ? (
                            Array.isArray(row["進捗工程"]) ? row["進捗工程"].join(" / ") : ""
                          ) : (
                            String(row[header] ?? "")
                          )}
                        </td>
                      ))}
                      {weeks.map((week) => {
                        const active = start && due && week.start <= due && week.end >= start;
                        return (
                          <td className="barcell" key={week.start.toISOString()}>
                            {active && <span className={`bar ${paid ? "paid" : statusClass(status)}`} />}
                          </td>
                        );
                      })}
                      <td className="work-status-col">{String(row["作業状況"] || "")}</td>
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
        <>
          <Panel title="担当者">
            <div className="table-wrap sticky-staff-table">
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
            </div>
          </Panel>
          <Panel title="担当者報酬一覧">
            <div className="table-wrap">
              <SimpleTable
                headers={[
                  "会社名",
                  "サービス",
                  "税抜金額",
                  "営業",
                  "開発",
                  "サブ",
                  "浅野報酬",
                  "鹿島報酬",
                  "川西報酬",
                ]}
                rows={rewardDetailRows}
              />
            </div>
          </Panel>
        </>
      )}

      {editingCase && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal case-edit-modal">
            <div className="modal-head">
              <div>
                <h2>
                  案件修正 NO {String(editingCase["NO"] || "")}{" "}
                  {String(editingCase["会社名"] || "")}
                </h2>
                <p className="note">修正後は上部または下部の保存ボタンを押してください</p>
              </div>
              <div className="modal-head-actions">
                <button disabled={isCaseEditSaving || isCaseDeleting} form="case-edit-form" type="submit">
                  {isCaseEditSaving ? "保存中" : "修正を保存"}
                </button>
                <button
                  className="danger"
                  disabled={isCaseEditSaving || isCaseDeleting}
                  onClick={() => void deleteEditingCase()}
                  type="button"
                >
                  {isCaseDeleting ? "削除中" : "削除"}
                </button>
                <button className="secondary" disabled={isCaseDeleting} onClick={() => setEditingCase(null)} type="button">
                  閉じる
                </button>
              </div>
            </div>

            <form className="case-form modal-case-form" id="case-edit-form" onSubmit={saveCaseEdit}>
              <Field label="会社名" onChange={updateEditingCase} value={editingCase["会社名"]} />
              <Field label="代表" onChange={updateEditingCase} value={editingCase["代表"]} />
              <Field label="アポ日" onChange={updateEditingCase} type="date" value={editingCase["アポ日"]} />
              <Field label="申込日" onChange={updateEditingCase} type="date" value={editingCase["申込日"]} />
              <Field label="入金日" onChange={updateEditingCase} type="date" value={editingCase["入金日"]} />
              <SelectField label="営業" onChange={updateEditingCase} options={["浅野", "鹿島", "川西", ""]} value={editingCase["営業"]} />
              <SelectField label="開発" onChange={updateEditingCase} options={["鹿島", "川西", "浅野", ""]} value={editingCase["開発"]} />
              <SelectField label="サブ" onChange={updateEditingCase} options={["", "鹿島", "川西", "浅野"]} value={editingCase["サブ"]} />
              {isRewardAdmin && (
                <>
                  <Field label="営業報酬率" onChange={updateEditingCase} type="number" value={editingCase["営業報酬率"]} />
                  <Field label="開発報酬率" onChange={updateEditingCase} type="number" value={editingCase["開発報酬率"]} />
                  <Field label="サブ報酬率" onChange={updateEditingCase} type="number" value={editingCase["サブ報酬率"]} />
                </>
              )}
              <SelectField label="申込状況" onChange={updateEditingCase} options={["", "済"]} value={editingCase["申込状況"]} />
              <SelectField label="入金状況" onChange={updateEditingCase} options={["", "済"]} value={editingCase["入金状況"]} />
              <Field label="サービス" onChange={updateEditingCase} value={editingCase["サービス"]} />
              <Field label="税抜単価" onChange={updateEditingCase} type="number" value={editingCase["税抜単価"]} />
              <Field label="個数" onChange={updateEditingCase} type="number" value={editingCase["個数"]} />
              <Field label="申込金額" onChange={updateEditingCase} type="number" value={editingCase["申込金額"]} />
              <Field label="入金金額" onChange={updateEditingCase} type="number" value={editingCase["入金金額"]} />
              <div className="form-actions">
                <button disabled={isCaseEditSaving || isCaseDeleting} type="submit">
                  {isCaseEditSaving ? "保存中" : "修正を保存"}
                </button>
                <button
                  className="danger"
                  disabled={isCaseEditSaving || isCaseDeleting}
                  onClick={() => void deleteEditingCase()}
                  type="button"
                >
                  {isCaseDeleting ? "削除中" : "削除"}
                </button>
                <button className="secondary" disabled={isCaseDeleting} onClick={() => setEditingCase(null)} type="button">
                  キャンセル
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {selectedProcess && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal">
            <div className="modal-head">
              <div>
                <h2>{String(selectedProcess["会社名"] || "")}</h2>
                <p className="note">現在の納期判定: {statusFor(selectedProcess)}</p>
              </div>
              <div className="modal-head-actions">
                <button disabled={isProcessSaving || isProcessDeleting} onClick={saveProcess} type="button">
                  {isProcessSaving ? "保存中" : "工程を保存"}
                </button>
                <button
                  className="danger"
                  disabled={isProcessSaving || isProcessDeleting}
                  onClick={() => void deleteSelectedProcess()}
                  type="button"
                >
                  {isProcessDeleting ? "削除中" : "削除"}
                </button>
                <button className="secondary" disabled={isProcessDeleting} onClick={() => setSelectedProcess(null)} type="button">
                  閉じる
                </button>
              </div>
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

              <SelectField
                label="営業"
                onChange={updateSelected}
                options={staffOptions}
                value={String(selectedProcess["営業"] || "")}
              />
              <SelectField
                label="開発"
                onChange={updateSelected}
                options={staffOptions}
                value={String(selectedProcess["開発"] || "")}
              />
              <SelectField
                label="サブ"
                onChange={updateSelected}
                options={staffOptions}
                value={String(selectedProcess["サブ"] || "")}
              />

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
                  placeholder="PDFを選択すると、抽出できた文字がここに入ります。画像PDFの場合は手入力してください。"
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
              <button disabled={isProcessSaving || isProcessDeleting} onClick={saveProcess} type="button">
                {isProcessSaving ? "保存中" : "工程を保存"}
              </button>
              <button
                className="danger"
                disabled={isProcessSaving || isProcessDeleting}
                onClick={() => void deleteSelectedProcess()}
                type="button"
              >
                {isProcessDeleting ? "削除中" : "削除"}
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

function extractQuoteItems(text: string) {
  if (!text.trim()) return [];

  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim();
  const headerIndex = normalized.search(/商品名\s+単位\s+数量/);
  const tableText =
    headerIndex >= 0
      ? normalized
          .slice(headerIndex)
          .replace(/^.*?商品名\s+単位\s+数量\s+単価\s*\(?税抜\)?\s+金額\s*\(?税抜\)?\s*/, "")
      : normalized;
  const endIndex = tableText.search(/\s+(?:小計|消費税|割引|合計金額|合計)\s*/);
  const target = endIndex >= 0 ? tableText.slice(0, endIndex) : tableText;
  const units = ["セット", "ファイル", "件", "式", "個", "時間", "枚", "本"];
  const unitPattern = units.join("|");
  const itemMatches = [
    ...target.matchAll(
      new RegExp(`(.+?)\\s+(${unitPattern})\\s+([0-9]+(?:\\.[0-9]+)?)\\s+(?:¥|￥)[0-9,]+\\s+(?:¥|￥)[0-9,]+`, "g"),
    ),
  ];

  return itemMatches
    .map((match) => ({
      name: match[1]
        .replace(/^.*商品名\s+単位\s+数量.*?金額\s*\(?税抜\)?\s*/, "")
        .replace(/\s+/g, "")
        .trim(),
      unit: match[2],
      quantity: match[3],
    }))
    .filter((item) => item.name && !/小計|消費税|合計|割引/.test(item.name));
}

function formatQuoteItems(items: ReturnType<typeof extractQuoteItems>) {
  if (!items.length) return "";
  const lines = items.map((item) => `${item.name} / ${item.unit} / ${item.quantity}`);
  return ["商品名 / 単位 / 数量", ...lines].join("\n");
}

function extractWorkContent(text: string) {
  const quoteItems = extractQuoteItems(text);
  if (quoteItems.length) return quoteItems.map((item) => item.name).join(" / ");

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
