"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

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

  // ✅ 検索・絞り込み
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<TaskState | "All">("All");
  const [prioF, setPrioF] = useState<TaskPriority | "All">("All");

  // ✅ ページネーション
  const [page, setPage] = useState(1);

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
    await Promise.all([loadMe(), loadProject(), loadTasks()]);
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
      return true;
    });
  }, [items, q, statusF, prioF]);

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