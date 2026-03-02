"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FullScreenLoading } from "@/components/FullScreenLoading";

type TaskState = "ToDo" | "Doing" | "Blocked" | "Done";
type TaskPriority = "High" | "Medium" | "Low";

type TaskItem = {
  taskId: number;
  projectId: number;
  title: string;
  description: string | null;
  status: TaskState;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeUserId: number | null;
};

type MeResponse = {
  userId: number;
  email: string;
  displayName: string;
  role: "Leader" | "Worker";
  roleId?: string | null;
};

type ProjectDetailResponse = {
  projectId: number;
  name: string;
  isArchived: boolean;
};

type ProjectMemberDto = {
  userId: number;
  displayName: string;
  email: string;
};

type DueFilter = "All" | "Overdue" | "DueSoon";

function toYmdNumber(iso: string | null): number | null {
  if (!iso) return null;
  const ymd = iso.length >= 10 ? iso.slice(0, 10) : iso; // "YYYY-MM-DD"
  const n = Number(ymd.replaceAll("-", ""));
  return Number.isFinite(n) ? n : null;
}

function ymdNumberFromDate(d: Date): number {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return Number(`${yyyy}${mm}${dd}`);
}

function addDaysYmdNumber(baseYmd: number, days: number): number {
  const s = String(baseYmd);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + days);
  return ymdNumberFromDate(dt);
}

const states: TaskState[] = ["ToDo", "Doing", "Blocked", "Done"];
const priorities: TaskPriority[] = ["High", "Medium", "Low"];
const PAGE_SIZE = 10;

function formatDate(iso: string | null) {
  if (!iso) return "-";
  // "2026-02-18" などを想定（ISO文字列でも先頭10桁ならOK）
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function statusLabelJa(s: TaskState) {
  switch (s) {
    case "ToDo":
      return "未着手";
    case "Doing":
      return "作業中";
    case "Blocked":
      return "ブロック中";
    case "Done":
      return "完了";
  }
}

function statusLabelEn(s: TaskState) {
  return s; // そのまま表示したい時用
}

// APIの TaskStatusTransitionPolicy と合わせる
function canTransition(from: TaskState, to: TaskState) {
  if (from === to) return true;
  if (from === "Done") return false;
  if (from === "ToDo") return to === "Doing";
  if (from === "Doing") return to === "Done" || to === "Blocked";
  if (from === "Blocked") return to === "Doing";
  return false;
}

function priorityBadge(p: TaskPriority) {
  if (p === "High") return { bg: "rgba(239,68,68,.12)", bd: "rgba(239,68,68,.28)", fg: "#fee2e2" };
  if (p === "Medium") return { bg: "rgba(245,158,11,.12)", bd: "rgba(245,158,11,.28)", fg: "#ffedd5" };
  return { bg: "rgba(16,185,129,.10)", bd: "rgba(16,185,129,.25)", fg: "#d1fae5" };
}

function statusBadge(s: TaskState) {
  if (s === "Done") return { bg: "rgba(16,185,129,.10)", bd: "rgba(16,185,129,.25)", fg: "#d1fae5" };
  if (s === "Blocked") return { bg: "rgba(239,68,68,.10)", bd: "rgba(239,68,68,.22)", fg: "#fee2e2" };
  if (s === "Doing") return { bg: "rgba(59,130,246,.12)", bd: "rgba(59,130,246,.25)", fg: "#dbeafe" };
  return { bg: "rgba(148,163,184,.10)", bd: "rgba(148,163,184,.20)", fg: "#e2e8f0" };
}

function safeStringify(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);

  // CSVルール：ダブルクォートは "" に、必要なら全体を "..." で囲む
  const needsQuote = /[",\r\n]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

function withUtf8Bom(s: string) {
  // Excel対策：UTF-8 BOM
  return "\uFEFF" + s;
}

function formatDateForCsv(iso: string | null) {
  if (!iso) return "";
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function sanitizeFileName(name: string) {
  // Windows等でNGな文字を置換
  return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function buildTasksCsvRows(args: {
  tasks: TaskItem[];
  members: ProjectMemberDto[];
}): string {
  const { tasks, members } = args;

  const memberMap = new Map<number, ProjectMemberDto>();
  for (const m of members) memberMap.set(m.userId, m);

  const header = [
    "TaskId",
    "Title",
    "Description",
    "StatusJa",
    "Status",
    "Priority",
    "DueDate",
    "AssigneeDisplayName",
  ];

  const lines: string[] = [];
  lines.push(header.map(csvEscape).join(","));

  for (const t of tasks) {
    const assignee =
      t.assigneeUserId != null ? memberMap.get(t.assigneeUserId)?.displayName ?? `User#${t.assigneeUserId}` : "";

    const row = [
      t.taskId,
      t.title,
      t.description ?? "",
      statusLabelJa(t.status),
      t.status,
      t.priority,
      formatDateForCsv(t.dueDate),
      assignee,
    ];

    lines.push(row.map(csvEscape).join(","));
  }

  // Excel/Windows互換寄り
  return lines.join("\r\n");
}

// apiFetch が throw するエラーの message だけだと ProblemDetails が潰れる可能性があるので、
// 可能なら “problem+jsonっぽい形” を整形して表示
function formatApiError(e: any) {
  // apiFetchが既にmessageに detail を詰めてくれてる場合はそれを優先
  const msg = e?.message ?? String(e);

  // もし apiFetch が e.body / e.data に ProblemDetails を入れてくれてるなら拾う
  const pd = e?.data ?? e?.body ?? null;
  if (pd && typeof pd === "object") {
    const title = (pd as any).title ?? "Request failed";
    const detail = (pd as any).detail ?? "";
    const exts = (pd as any).extensions ?? (pd as any);

    // extensionsが大きすぎる場合もあるので、最低限だけ見せる
    const picked: Record<string, unknown> = {};
    for (const k of ["from", "to", "allowed", "currentStatus"]) {
      if ((pd as any)[k] !== undefined) picked[k] = (pd as any)[k];
      if ((pd as any).extensions?.[k] !== undefined) picked[k] = (pd as any).extensions[k];
    }

    const extra = Object.keys(picked).length ? `\n\n---\n${safeStringify(picked)}` : "";
    return `${title}\n${detail}${extra}`.trim();
  }

  return msg;
}

export default function ProjectTasksPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = Number(params.projectId);

  const [project, setProject] = useState<ProjectDetailResponse | null>(null);
  const [items, setItems] = useState<TaskItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // ✅ me（Leader判定に使う）
  const [me, setMe] = useState<MeResponse | null>(null);

  const [members, setMembers] = useState<ProjectMemberDto[]>([]);

  // ✅ 検索・絞り込み
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<TaskState | "All">("All");
  const [prioF, setPrioF] = useState<TaskPriority | "All">("All");
  const [dueF, setDueF] = useState<DueFilter>("All");

  // ✅ ページネーション
  const [page, setPage] = useState(1);

  // ✅ CSVポップアップ
const [csvOpen, setCsvOpen] = useState(false);
const [csvFileBase, setCsvFileBase] = useState("");

const title = useMemo(() => {
  if (project?.name) return project.name;
  return `案件 ${projectId}`;
}, [project?.name, projectId]);

  async function loadMe() {
    try {
      const data = await apiFetch<MeResponse>("/api/v1/users/me");
      setMe(data);
    } catch {
      setMe(null);
    }
  }

const todayYmd = useMemo(() => ymdNumberFromDate(new Date()), []);
const dueSoonYmd = useMemo(() => addDaysYmdNumber(todayYmd, 7), [todayYmd]);

  async function loadMembers() {
  try {
    const data = await apiFetch<ProjectMemberDto[]>(`/api/v1/projects/${projectId}/members`);
    setMembers(data);
  } catch {
    setMembers([]);
  }
}

  async function loadTasks() {
    setErr(null);
    setBusy(true);
    try {
      const data = await apiFetch<TaskItem[]>(`/api/v1/projects/${projectId}/tasks`);
      // 表示が安定するように並び替え（必要なければ削除OK）
      data.sort((a, b) => b.taskId - a.taskId);
      setItems(data);
      setPage(1);
    } catch (e: any) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadProject() {
  try {
    const p = await apiFetch<ProjectDetailResponse>(`/api/v1/projects/${projectId}`);
    setProject(p);
  } catch {
    setProject(null);
  }
}


async function loadAll() {
  setErr(null);
  setBusy(true);
  try {
    await Promise.all([loadMe(), loadProject(), loadTasks(), loadMembers()]);
  } finally {
    setBusy(false);
  }
}

  useEffect(() => {
    if (!Number.isFinite(projectId) || projectId <= 0) return;
    // 初回：meとtasks
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ✅ フィルタ → ページングの順
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((t) => {
      if (statusF !== "All" && t.status !== statusF) return false;
      if (prioF !== "All" && t.priority !== prioF) return false;
      if (qq) {
        const hay = `${t.title} ${t.description ?? ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }

      if (dueF !== "All") {
        if (t.status === "Done") return false;

        const ymd = toYmdNumber(t.dueDate);
        if (ymd == null) return false;

        if (dueF === "Overdue") {
          if (!(ymd < todayYmd)) return false;
        } else if (dueF === "DueSoon") {
          if (!(ymd >= todayYmd && ymd <= dueSoonYmd)) return false;
        }
      }
      return true;
    });
  },[items, q, statusF, prioF, dueF, todayYmd, dueSoonYmd]);


const summary = useMemo(() => {
  const progress = { toDo: 0, doing: 0, blocked: 0, done: 0 };
  let overdue = 0;
  let dueSoon = 0;

  for (const t of items) {
    if (t.status === "ToDo") progress.toDo++;
    else if (t.status === "Doing") progress.doing++;
    else if (t.status === "Blocked") progress.blocked++;
    else if (t.status === "Done") progress.done++;

    if (t.status === "Done") continue;
    const ymd = toYmdNumber(t.dueDate);
    if (ymd == null) continue;

    if (ymd < todayYmd) overdue++;
    else if (ymd >= todayYmd && ymd <= dueSoonYmd) dueSoon++;
  }

  return { overdue, dueSoon, progress };
}, [items, todayYmd, dueSoonYmd]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));


  
  // ページ範囲外を自動補正（削除/絞り込みが入ったときも安全）
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  const isLeader = me?.role === "Leader";

const isMember = useMemo(() => {
  if (!me) return false;
  return members.some((m) => m.userId === me.userId);
}, [members, me]);

const canCreateTask = isLeader || isMember;

  async function archiveProject() {
    if (!confirm("この案件をアーカイブ（削除扱い）します。よろしいですか？")) return;

    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/projects/${projectId}`, { method: "DELETE" });
      // 成功したら一覧へ
      router.push("/projects");
    } catch (e: any) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

async function exportCsvFilteredAll(fileBaseName: string) {
  try {
    const csv = buildTasksCsvRows({ tasks: filtered, members });
    const safeBase = sanitizeFileName(fileBaseName || "tasks");
    const fileName = `${safeBase}.csv`;

    const blob = new Blob([withUtf8Bom(csv)], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setCsvOpen(false);
  } catch (e: any) {
    setErr(`CSV出力に失敗しました。\n${formatApiError(e)}`);
  }
}

function openCsvDialog() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  // 初期ファイル名（拡張子なし）
  setCsvFileBase(sanitizeFileName(`${title}_tasks_${yyyy}-${mm}-${dd}`));
  setCsvOpen(true);
}

function closeCsvDialog() {
  setCsvOpen(false);
}

return (
  <main style={{ minHeight: "100vh", padding: 16, background: "#121212", color: "#e5e7eb" }}>
    <style>{`
      /* レスポンシブ：768px未満はカード、以上はテーブル */
      .pcOnly { display: block; }
      .spOnly { display: none; }
      @media (max-width: 768px) {
        .pcOnly { display: none; }
        .spOnly { display: block; }
      }
    `}</style>
<FullScreenLoading show={busy} label="処理中…" subLabel="ユーザー情報 / メンバー情報を取得しています" />

    <div style={{ maxWidth: 1100, margin: "28px auto" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 520px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Link
              href="/projects"
              style={{
                color: "#cbd5e1",
                textDecoration: "none",
                border: "1px solid #2a2a2a",
                background: "#171717",
                padding: "8px 10px",
                borderRadius: 12,
              }}
            >
              ← 戻る
            </Link>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #2a2a2a",
                background: "#171717",
                color: "#cbd5e1",
                fontSize: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #3b82f6, #10b981)",
                }}
              />
              Task Status Transition Validation
            </div>

            {me && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #2a2a2a",
                  background: "#171717",
                  color: isLeader ? "#bbf7d0" : "#cbd5e1",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
                title={me.email}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: isLeader ? "rgba(16,185,129,.9)" : "rgba(148,163,184,.9)",
                  }}
                />
                {me.displayName}（{isLeader ? "Leader" : "Worker"}）
              </div>
            )}
          </div>

          <h1 style={{ margin: "12px 0 6px", fontSize: 26, fontWeight: 800 }}>
            {title} / タスク
          </h1>

          <p style={{ margin: 0, color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>
            状態遷移チェックは API 側で検証され、NG の場合はエラーが表示されます。
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            flex: "0 1 auto",
          }}
        >
          {isLeader && (
            <button
              type="button"
              onClick={archiveProject}
              disabled={busy}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(239,68,68,.35)",
                background: busy ? "#141414" : "rgba(239,68,68,.12)",
                color: "#fee2e2",
                cursor: busy ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
              title="アーカイブ（削除扱い）"
            >
              案件削除（アーカイブ）
            </button>
          )}

{canCreateTask && (
  <button
    type="button"
    onClick={() => router.push(`/projects/${projectId}/tasks/new`)}
    disabled={busy}
    style={{
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(59,130,246,.35)",
      background: busy ? "#141414" : "rgba(59,130,246,.14)",
      color: "#dbeafe",
      cursor: busy ? "not-allowed" : "pointer",
      whiteSpace: "nowrap",
    }}
    title="タスクを新規作成"
  >
    ＋ タスク作成
  </button>
)}

<button
  type="button"
  onClick={openCsvDialog}
  disabled={busy || filtered.length === 0}
  style={{
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(16,185,129,.28)",
    background: busy || filtered.length === 0 ? "#141414" : "rgba(16,185,129,.12)",
    color: "#d1fae5",
    cursor: busy || filtered.length === 0 ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
  }}
  title="絞り込み後の全件をCSVでダウンロード"
>
  ⭳ CSV出力（全件）
</button>
          <button
            type="button"
            onClick={loadAll}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #2a2a2a",
              background: busy ? "#141414" : "#1a1a1a",
              color: "#e5e7eb",
              cursor: busy ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {busy ? "読み込み中…" : "再読込"}
          </button>
        </div>
      </header>

{summary && (
  <section
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      gap: 12,
      marginBottom: 16,
    }}
  >
    {/* 期限切れ */}
    <button
      type="button"
      onClick={() => {
        setDueF("Overdue");
        setStatusF("All");
        setPrioF("All");
        setQ("");
        setPage(1);
      }}
      style={{
        textAlign: "left",
        padding: 14,
        borderRadius: 16,
        border: "1px solid rgba(239,68,68,.25)",
        background: "rgba(239,68,68,.08)",
        color: "#fee2e2",
        cursor: "pointer",
      }}
      title="期限切れを表示"
    >
      <div style={{ fontSize: 12, color: "#fecaca" }}>期限切れ</div>
      <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900 }}>{summary.overdue}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#fca5a5" }}>クリックで絞り込み</div>
    </button>

    {/* 近日期限 */}
    <button
      type="button"
      onClick={() => {
        setDueF("DueSoon");
        setStatusF("All");
        setPrioF("All");
        setQ("");
        setPage(1);
      }}
      style={{
        textAlign: "left",
        padding: 14,
        borderRadius: 16,
        border: "1px solid rgba(245,158,11,.25)",
        background: "rgba(245,158,11,.08)",
        color: "#ffedd5",
        cursor: "pointer",
      }}
      title="近日期限を表示（7日以内）"
    >
      <div style={{ fontSize: 12, color: "#fed7aa" }}>近日期限（7日以内）</div>
      <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900 }}>{summary.dueSoon}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#fdba74" }}>クリックで絞り込み</div>
    </button>

    {/* 進捗 */}
    <div
      style={{
        padding: 14,
        borderRadius: 16,
        border: "1px solid rgba(59,130,246,.25)",
        background: "rgba(59,130,246,.08)",
        color: "#dbeafe",
      }}
    >
      <div style={{ fontSize: 12, color: "#bfdbfe" }}>進捗サマリー</div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            ["ToDo", summary.progress.toDo],
            ["Doing", summary.progress.doing],
            ["Blocked", summary.progress.blocked],
            ["Done", summary.progress.done],
          ] as const
        ).map(([s, n]) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setDueF("All");
              setStatusF(s as any);
              setPage(1);
            }}
            style={{
              border: "1px solid #2a2a2a",
              background: "#121212",
              color: "#e5e7eb",
              borderRadius: 999,
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
            title="状態で絞り込み"
          >
            {statusLabelJa(s as any)}：<span style={{ fontWeight: 900 }}>{n}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            setDueF("All");
            setStatusF("All");
            setPrioF("All");
            setQ("");
            setPage(1);
          }}
          style={{
            border: "1px solid #2a2a2a",
            background: "#171717",
            color: "#e5e7eb",
            borderRadius: 999,
            padding: "6px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
          title="フィルタ解除"
        >
          リセット
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af" }}>
        現在の期限フィルタ：<span style={{ color: "#e5e7eb", fontWeight: 800 }}>{dueF}</span>
      </div>
    </div>
  </section>
)}

{/* CSV Export Dialog */}
{csvOpen && (
  <div
    role="dialog"
    aria-modal="true"
    onClick={closeCsvDialog}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.55)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 1000,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "min(560px, 100%)",
        borderRadius: 16,
        border: "1px solid #2a2a2a",
        background: "#171717",
        boxShadow: "0 18px 60px rgba(0,0,0,.55)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #2a2a2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 800 }}>CSV出力</div>
        <button
          type="button"
          onClick={closeCsvDialog}
          style={{
            border: "1px solid #2a2a2a",
            background: "#121212",
            color: "#e5e7eb",
            borderRadius: 12,
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.6 }}>
          絞り込み後の全件をCSVでダウンロードします。
        </div>

        <div style={{ marginTop: 10, color: "#9ca3af", fontSize: 12 }}>
          対象件数：<span style={{ color: "#e5e7eb", fontWeight: 800 }}>{filtered.length}</span> 件
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>ファイル名（.csv は自動付与）</div>
          <input
            value={csvFileBase}
            onChange={(e) => setCsvFileBase(e.target.value)}
            placeholder="例: my_tasks_2026-02-27"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #2a2a2a",
              background: "#121212",
              color: "#e5e7eb",
              outline: "none",
              fontSize: 13,
            }}
          />
          <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
            出力列：TaskId / Title / Description / StatusJa / Status / Priority / DueDate / AssigneeDisplayName
            <br />
            文字コード：UTF-8（Excel対策でBOM付き）
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #2a2a2a",
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={closeCsvDialog}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #2a2a2a",
            background: "#121212",
            color: "#e5e7eb",
            cursor: "pointer",
          }}
        >
          キャンセル
        </button>

        <button
          type="button"
          onClick={() => exportCsvFilteredAll(csvFileBase)}
          disabled={busy || filtered.length === 0}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(16,185,129,.28)",
            background: busy || filtered.length === 0 ? "#141414" : "rgba(16,185,129,.12)",
            color: "#d1fae5",
            cursor: busy || filtered.length === 0 ? "not-allowed" : "pointer",
            fontWeight: 800,
          }}
        >
          ダウンロード
        </button>
      </div>
    </div>
  </div>
)}

      {/* Error */}
      {err && (
        <section
          role="alert"
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 14,
            background: "rgba(239,68,68,.10)",
            border: "1px solid rgba(239,68,68,.25)",
            color: "#fee2e2",
            whiteSpace: "pre-wrap",
            lineHeight: 1.6,
            fontSize: 13,
          }}
        >
          {err}
        </section>
      )}

      {/* Card */}
      <section
        style={{
          borderRadius: 16,
          border: "1px solid #2a2a2a",
          background: "#1a1a1a",
          boxShadow: "0 16px 50px rgba(0,0,0,.35)",
          overflow: "hidden",
        }}
      >
        {/* Toolbar */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid #2a2a2a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: "#cbd5e1", fontSize: 13 }}>
            {busy ? "読み込み中…" : `全 ${total} 件（絞り込み後） / ${PAGE_SIZE}件表示`}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="検索（タイトル・説明）"
              style={{
                width: 240,
                maxWidth: "100%",
                padding: "9px 10px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: "#121212",
                color: "#e5e7eb",
                outline: "none",
                fontSize: 12,
              }}
            />

            <select
              value={statusF}
              onChange={(e) => {
                setStatusF(e.target.value as any);
                setPage(1);
              }}
              style={{
                padding: "9px 10px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: "#121212",
                color: "#e5e7eb",
                outline: "none",
                fontSize: 12,
              }}
            >
              <option value="All">状態：すべて</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {statusLabelJa(s)}（{statusLabelEn(s)}）
                </option>
              ))}
            </select>

            <select
              value={prioF}
              onChange={(e) => {
                setPrioF(e.target.value as any);
                setPage(1);
              }}
              style={{
                padding: "9px 10px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: "#121212",
                color: "#e5e7eb",
                outline: "none",
                fontSize: 12,
              }}
            >
              <option value="All">優先度：すべて</option>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {(q || statusF !== "All" || prioF !== "All") && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setStatusF("All");
                  setPrioF("All");
                  setDueF("All");
                  setPage(1);
                }}
                style={{
                  padding: "9px 10px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: "#171717",
                  color: "#e5e7eb",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                クリア
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={goPrev}
              disabled={page <= 1 || busy}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: page <= 1 || busy ? "#141414" : "#171717",
                color: "#e5e7eb",
                cursor: page <= 1 || busy ? "not-allowed" : "pointer",
                fontSize: 12,
              }}
            >
              ← 前へ
            </button>

            <div style={{ color: "#9ca3af", fontSize: 12, minWidth: 110, textAlign: "center" }}>
              {page} / {totalPages}
            </div>

            <button
              type="button"
              onClick={goNext}
              disabled={page >= totalPages || busy}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: page >= totalPages || busy ? "#141414" : "#171717",
                color: "#e5e7eb",
                cursor: page >= totalPages || busy ? "not-allowed" : "pointer",
                fontSize: 12,
              }}
            >
              次へ →
            </button>
          </div>
        </div>

        {/* ===== PC: TABLE ===== */}
        <div className="pcOnly" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["ID", "タイトル", "期限", "優先度", "状態", "操作（状態変更）"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "12px 12px",
                      borderBottom: "1px solid #2a2a2a",
                      color: "#cbd5e1",
                      fontSize: 12,
                      letterSpacing: ".02em",
                      background: "#171717",
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {busy &&
                Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={`s-${i}`}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} style={{ padding: "12px 12px", borderBottom: "1px solid #222" }}>
                        <div
                          style={{
                            height: 14,
                            borderRadius: 8,
                            background:
                              "linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.02), rgba(255,255,255,.04))",
                            width: j === 1 ? "70%" : "45%",
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}

              {!busy && pageItems.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 18, color: "#9ca3af" }}>
                    タスクがありません（または絞り込み条件に一致しません）。
                  </td>
                </tr>
              )}

              {!busy &&
                pageItems.map((t) => (
                  <tr key={t.taskId}>
                    <td style={{ padding: "12px 12px", borderBottom: "1px solid #222", color: "#cbd5e1" }}>
                      {t.taskId}
                    </td>

                    <td style={{ padding: "12px 12px", borderBottom: "1px solid #222" }}>
                      <div style={{ fontWeight: 800, color: "#e5e7eb" }}>
                        <Link
                          href={`/projects/${projectId}/tasks/${t.taskId}`}
                          style={{ color: "#e5e7eb", textDecoration: "none" }}
                          title="タスク詳細へ"
                        >
                          {t.title}
                        </Link>
                      </div>

                      {t.description ? (
                        <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af", lineHeight: 1.4 }}>
                          {t.description}
                        </div>
                      ) : null}
                    </td>

                    <td style={{ padding: "12px 12px", borderBottom: "1px solid #222", color: "#cbd5e1" }}>
                      {formatDate(t.dueDate)}
                    </td>

                    <td style={{ padding: "12px 12px", borderBottom: "1px solid #222" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: `1px solid ${priorityBadge(t.priority).bd}`,
                          background: priorityBadge(t.priority).bg,
                          color: priorityBadge(t.priority).fg,
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.priority}
                      </span>
                    </td>

                    {/* 状態：表示だけ */}
                    <td style={{ padding: "12px 12px", borderBottom: "1px solid #222" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: `1px solid ${statusBadge(t.status).bd}`,
                          background: statusBadge(t.status).bg,
                          color: statusBadge(t.status).fg,
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                        title={`${statusLabelJa(t.status)}（${statusLabelEn(t.status)}）`}
                      >
                        {statusLabelJa(t.status)}
                      </span>
                    </td>

                    {/* 操作：状態変更 + 更新中 */}
                    <td style={{ padding: "12px 12px", borderBottom: "1px solid #222", color: "#9ca3af" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <select
                          value={t.status}
                          disabled={busyId === t.taskId || t.status === "Done"}
                          onChange={async (e) => {
                            const next = e.target.value as TaskState;

                            if (!canTransition(t.status, next)) {
                              setErr(`状態遷移が許可されていません: ${t.status} → ${next}`);
                              return;
                            }

                            setBusyId(t.taskId);
                            setErr(null);
                            try {
                              await apiFetch(`/api/v1/tasks/${t.taskId}`, {
                                method: "PUT",
                                body: JSON.stringify({
                                  title: t.title,
                                  description: t.description,
                                  assigneeUserId: t.assigneeUserId,
                                  dueDate: t.dueDate,
                                  priority: t.priority,
                                  status: next,
                                }),
                              });
                              await loadTasks();
                            } catch (e2: any) {
                              setErr(formatApiError(e2));
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 12,
                            border: "1px solid #2a2a2a",
                            background: "#121212",
                            color: "#e5e7eb",
                            outline: "none",
                            cursor: busyId === t.taskId || t.status === "Done" ? "not-allowed" : "pointer",
                            opacity: t.status === "Done" ? 0.65 : 1,
                          }}
                          title={t.status === "Done" ? "完了（Done）のタスクは更新できません" : "状態を変更"}
                        >
                          {states.map((s) => (
                            <option key={s} value={s} disabled={!canTransition(t.status, s)}>
                              {statusLabelJa(s)}（{s}）
                            </option>
                          ))}
                        </select>

                        {busyId === t.taskId && <span style={{ fontSize: 12 }}>更新中…</span>}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* ===== SP: CARDS ===== */}
        <div className="spOnly" style={{ padding: 12 }}>
          {busy &&
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`c-s-${i}`}
                style={{
                  border: "1px solid #2a2a2a",
                  background: "#171717",
                  borderRadius: 16,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ height: 14, borderRadius: 8, background: "rgba(255,255,255,.06)", width: "60%" }} />
                <div style={{ height: 12, borderRadius: 8, background: "rgba(255,255,255,.05)", width: "40%", marginTop: 10 }} />
                <div style={{ height: 12, borderRadius: 8, background: "rgba(255,255,255,.05)", width: "70%", marginTop: 10 }} />
              </div>
            ))}

          {!busy && pageItems.length === 0 && (
            <div style={{ padding: 12, color: "#9ca3af" }}>
              タスクがありません（または絞り込み条件に一致しません）。
            </div>
          )}

          {!busy &&
            pageItems.map((t) => (
              <div
                key={t.taskId}
                style={{
                  border: "1px solid #2a2a2a",
                  background: "#171717",
                  borderRadius: 16,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>ID: {t.taskId}</div>
                    <div style={{ marginTop: 4, fontWeight: 800, color: "#e5e7eb" }}>
                      <Link
                        href={`/projects/${projectId}/tasks/${t.taskId}`}
                        style={{ color: "#e5e7eb", textDecoration: "none" }}
                      >
                        {t.title}
                      </Link>
                    </div>
                  </div>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: `1px solid ${statusBadge(t.status).bd}`,
                      background: statusBadge(t.status).bg,
                      color: statusBadge(t.status).fg,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      flex: "0 0 auto",
                    }}
                  >
                    {statusLabelJa(t.status)}
                  </span>
                </div>

                {t.description ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
                    {t.description}
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                    期限: <span style={{ color: "#e5e7eb" }}>{formatDate(t.dueDate)}</span>
                  </div>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: `1px solid ${priorityBadge(t.priority).bd}`,
                      background: priorityBadge(t.priority).bg,
                      color: priorityBadge(t.priority).fg,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.priority}
                  </span>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={t.status}
                    disabled={busyId === t.taskId || t.status === "Done"}
                    onChange={async (e) => {
                      const next = e.target.value as TaskState;

                      if (!canTransition(t.status, next)) {
                        setErr(`状態遷移が許可されていません: ${t.status} → ${next}`);
                        return;
                      }

                      setBusyId(t.taskId);
                      setErr(null);
                      try {
                        await apiFetch(`/api/v1/tasks/${t.taskId}`, {
                          method: "PUT",
                          body: JSON.stringify({
                            title: t.title,
                            description: t.description,
                            assigneeUserId: t.assigneeUserId,
                            dueDate: t.dueDate,
                            priority: t.priority,
                            status: next,
                          }),
                        });
                        await loadTasks();
                      } catch (e2: any) {
                        setErr(formatApiError(e2));
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #2a2a2a",
                      background: "#121212",
                      color: "#e5e7eb",
                      outline: "none",
                      cursor: busyId === t.taskId || t.status === "Done" ? "not-allowed" : "pointer",
                      opacity: t.status === "Done" ? 0.65 : 1,
                    }}
                    title={t.status === "Done" ? "完了（Done）のタスクは更新できません" : "状態を変更"}
                  >
                    {states.map((s) => (
                      <option key={s} value={s} disabled={!canTransition(t.status, s)}>
                        {statusLabelJa(s)}（{s}）
                      </option>
                    ))}
                  </select>

                  {busyId === t.taskId && <div style={{ fontSize: 12, color: "#9ca3af" }}>更新中…</div>}
                </div>
              </div>
            ))}
        </div>

        {/* Bottom pagination */}
        {!busy && total > 0 && (
          <div
            style={{
              padding: "12px 14px",
              borderTop: "1px solid #2a2a2a",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              表示範囲：{(page - 1) * PAGE_SIZE + 1}〜{Math.min(page * PAGE_SIZE, total)} / {total}
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={goPrev}
                disabled={page <= 1}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: page <= 1 ? "#141414" : "#171717",
                  color: "#e5e7eb",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  fontSize: 12,
                }}
              >
                ← 前へ
              </button>

              <div style={{ fontSize: 12, color: "#9ca3af", minWidth: 110, textAlign: "center" }}>
                {page} / {totalPages}
              </div>

              <button
                type="button"
                onClick={goNext}
                disabled={page >= totalPages}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: page >= totalPages ? "#141414" : "#171717",
                  color: "#e5e7eb",
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                  fontSize: 12,
                }}
              >
                次へ →
              </button>
            </div>
          </div>
        )}
      </section>

      <p style={{ marginTop: 14, color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
        ※ 状態遷移チェック（ToDo→Doing→Done、Doing→Blocked、Blocked→Doing）を API 側で弾くと、このページにエラーメッセージが表示されます。
        <br />
        ※ 完了（Done）のタスクはサーバー側ポリシーで更新不可のため、この画面でも編集を無効化しています。
      </p>
    </div>
  </main>
);
}