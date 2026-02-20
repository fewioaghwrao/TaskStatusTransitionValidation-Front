"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";

type TaskState = "ToDo" | "Doing" | "Blocked" | "Done";
type TaskItem = {
  taskId: number;
  projectId: number;
  title: string;
  description: string | null;
  status: TaskState;
  priority: "High" | "Medium" | "Low";
  dueDate: string | null;
  assigneeUserId: number | null;
};

const states: TaskState[] = ["ToDo", "Doing", "Blocked", "Done"];
const PAGE_SIZE = 10;

function formatDate(iso: string | null) {
  if (!iso) return "-";
  // "2026-02-18" などを想定（ISO文字列でも先頭10桁ならOK）
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function statusLabel(s: TaskState) {
  switch (s) {
    case "ToDo":
      return "ToDo";
    case "Doing":
      return "Doing";
    case "Blocked":
      return "Blocked";
    case "Done":
      return "Done";
  }
}

function priorityBadge(p: TaskItem["priority"]) {
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

export default function ProjectTasksPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);

  const [items, setItems] = useState<TaskItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // ✅ ページネーション
  const [page, setPage] = useState(1);

  const title = useMemo(() => `案件 ${projectId}`, [projectId]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ページ範囲外を自動補正（削除/絞り込みが入ったときも安全）
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, page]);

  async function load() {
    setErr(null);
    setBusy(true);
    try {
      const data = await apiFetch<TaskItem[]>(
        `/api/v1/projects/${projectId}/tasks`
      );

      // 表示が安定するように並び替え（必要なければ削除OK）
      data.sort((a, b) => b.taskId - a.taskId);

      setItems(data);
      setPage(1); // ✅ 再読込時は1ページへ
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(projectId) || projectId <= 0) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return (
    <main style={{ minHeight: "100vh", padding: 16, background: "#121212", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 1100, margin: "28px auto" }}>
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 18,
          }}
        >
          <div style={{ minWidth: 0 }}>
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
            </div>

            <h1 style={{ margin: "12px 0 6px", fontSize: 26, fontWeight: 800 }}>
              {title} / タスク
            </h1>

            <p style={{ margin: 0, color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>
              状態遷移チェックは API 側で検証され、NG の場合はエラーが表示されます。
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={load}
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
              {busy ? "読み込み中…" : `全 ${total} 件 / ${PAGE_SIZE}件表示`}
            </div>

            {/* Pagination */}
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

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["ID", "タイトル", "期限", "優先度", "状態", "操作"].map((h) => (
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
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* Loading skeleton */}
                {busy &&
                  Array.from({ length: PAGE_SIZE }).map((_, i) => (
                    <tr key={`s-${i}`}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td
                          key={j}
                          style={{
                            padding: "12px 12px",
                            borderBottom: "1px solid #222",
                          }}
                        >
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
                      タスクがありません。
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
                        <div style={{ fontWeight: 800, color: "#e5e7eb" }}>{t.title}</div>
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

                      <td style={{ padding: "12px 12px", borderBottom: "1px solid #222" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                          >
                            {statusLabel(t.status)}
                          </span>

                          <select
                            value={t.status}
                            disabled={busyId === t.taskId}
                            onChange={async (e) => {
                              const next = e.target.value as TaskState;
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
                                await load();
                              } catch (e2: any) {
                                setErr(e2?.message ?? String(e2));
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
                              cursor: busyId === t.taskId ? "not-allowed" : "pointer",
                            }}
                          >
                            {states.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td style={{ padding: "12px 12px", borderBottom: "1px solid #222", color: "#9ca3af" }}>
                        {busyId === t.taskId ? "更新中…" : ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Bottom pagination (UX良いので下にも置く) */}
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
          ※ 状態遷移チェック（例：ToDo→Doing→Done など）を API 側で弾くと、このページにエラーメッセージが表示されます。
        </p>
      </div>
    </main>
  );
}
