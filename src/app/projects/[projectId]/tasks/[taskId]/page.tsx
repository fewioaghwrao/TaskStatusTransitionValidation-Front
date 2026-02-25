"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type TaskState = "ToDo" | "Doing" | "Blocked" | "Done";
type TaskPriority = "High" | "Medium" | "Low";

type TaskResponse = {
  taskId: number;
  projectId: number;
  title: string;
  description: string | null;
  status: TaskState;
  priority: TaskPriority;
  dueDate: string | null; // "yyyy-MM-dd"
  assigneeUserId: number | null;
  createdAt: string;
  updatedAt: string;
};

type Member = {
  userId: number;
  displayName: string;
  email: string;
};

const states: TaskState[] = ["ToDo", "Doing", "Blocked", "Done"];
const priorities: TaskPriority[] = ["High", "Medium", "Low"];

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

// APIの TaskStatusTransitionPolicy と一致
function canTransition(from: TaskState, to: TaskState) {
  if (from === to) return true;
  if (from === "Done") return false;
  if (from === "ToDo") return to === "Doing";
  if (from === "Doing") return to === "Done" || to === "Blocked";
  if (from === "Blocked") return to === "Doing";
  return false;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

function safeStringify(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function formatApiError(e: any) {
  const msg = e?.message ?? String(e);

  const pd = e?.data ?? e?.body ?? null;
  if (pd && typeof pd === "object") {
    const title = (pd as any).title ?? "Request failed";
    const detail = (pd as any).detail ?? "";
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

export default function TaskDetailPage() {
  const params = useParams<{ projectId: string; taskId: string }>();
  const router = useRouter();

  const projectId = Number(params.projectId);
  const taskId = Number(params.taskId);

  // ✅ Hooksは必ずコンポーネント関数の中
  const [members, setMembers] = useState<Member[]>([]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [original, setOriginal] = useState<TaskResponse | null>(null);

  // 編集フォーム状態
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>(""); // input[type=date] は "yyyy-MM-dd"
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [status, setStatus] = useState<TaskState>("ToDo");

  const isDone = original?.status === "Done";

  const dirty = useMemo(() => {
    if (!original) return false;
    return (
      title !== original.title ||
      description !== (original.description ?? "") ||
      (dueDate || null) !== (original.dueDate ?? null) ||
      priority !== original.priority ||
      status !== original.status
      // ※担当者は「表示のみ」にしたいので編集対象から外す
    );
  }, [original, title, description, dueDate, priority, status]);

  async function loadMembers() {
    if (!Number.isFinite(projectId) || projectId <= 0) return;

    try {
      const ms = await apiFetch<Member[]>(`/api/v1/projects/${projectId}/members`);
      setMembers(ms);
    } catch {
      setMembers([]); // 表示のみなので失敗しても落とさない
    }
  }

  function assigneeLabel(userId: number | null) {
    if (userId == null) return "未割当";

    const m = members.find((x) => x.userId === userId);
    if (!m) return `ユーザー#${userId}`;

    return m.displayName?.trim() ? m.displayName : m.email;
  }

  async function load() {
    if (!Number.isFinite(taskId) || taskId <= 0) return;

    setErr(null);
    setBusy(true);
    try {
      const data = await apiFetch<TaskResponse>(`/api/v1/tasks/${taskId}`);
      setOriginal(data);

      // フォーム初期化
      setTitle(data.title);
      setDescription(data.description ?? "");
      setDueDate(data.dueDate ?? "");
      setPriority(data.priority);
      setStatus(data.status);
    } catch (e: any) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(projectId) || projectId <= 0) return;
    if (!Number.isFinite(taskId) || taskId <= 0) return;

    // 並列でOK（失敗しても片方で落とさない設計にしてある）
    load();
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, taskId]);

  function reset() {
    if (!original) return;
    setTitle(original.title);
    setDescription(original.description ?? "");
    setDueDate(original.dueDate ?? "");
    setPriority(original.priority);
    setStatus(original.status);
    setErr(null);
  }

  function buildSaveConfirmMessage(o: TaskResponse) {
    const diffs: string[] = [];
    if (title !== o.title) diffs.push(`タイトル: "${o.title}" → "${title}"`);
    if (description !== (o.description ?? "")) diffs.push("説明: 変更あり");
    if ((dueDate || "") !== (o.dueDate ?? "")) diffs.push(`期限: "${o.dueDate ?? "-"}" → "${dueDate || "-"}"`);
    if (priority !== o.priority) diffs.push(`優先度: ${o.priority} → ${priority}`);
    if (status !== o.status) diffs.push(`状態: ${o.status} → ${status}`);

    // diffs空は本来 save が呼ばれないが、保険
    return diffs.length
      ? `以下の変更を保存します。よろしいですか？\n\n- ${diffs.join("\n- ")}`
      : "変更がありません。";
  }

  async function save() {
    if (!original) return;

    if (isDone) {
      setErr("完了（Done）のタスクは更新できません（サーバーポリシー）。");
      return;
    }
    if (!dirty) return;

    if (!confirm(buildSaveConfirmMessage(original))) return;

    // 遷移ガード（サーバーが最終）
    if (!canTransition(original.status, status)) {
      setErr(`状態遷移が許可されていません: ${original.status} → ${status}`);
      return;
    }

    setErr(null);
    setBusy(true);
    try {
      await apiFetch(`/api/v1/tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() === "" ? null : description,
          dueDate: dueDate.trim() === "" ? null : dueDate,
          priority,
          status,
          // ✅ 担当者は表示のみ：送らない（APIが必須なら original.assigneeUserId を送る）
        }),
      });

      await load();
    } catch (e: any) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: 16, background: "#121212", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 980, margin: "28px auto" }}>
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
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Link
                href={`/projects/${projectId}`}
                style={{
                  color: "#cbd5e1",
                  textDecoration: "none",
                  border: "1px solid #2a2a2a",
                  background: "#171717",
                  padding: "8px 10px",
                  borderRadius: 12,
                }}
              >
                ← 一覧へ
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
                Task Detail
              </div>
            </div>

            <h1 style={{ margin: "12px 0 6px", fontSize: 26, fontWeight: 800 }}>
              案件 {projectId} / タスク {taskId}
            </h1>

            <p style={{ margin: 0, color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>
              状態遷移は API 側で最終検証されます。Done は終端で更新不可です。
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                load();
                loadMembers();
              }}
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

            <button
              type="button"
              onClick={reset}
              disabled={busy || !dirty}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: busy || !dirty ? "#141414" : "#171717",
                color: "#e5e7eb",
                cursor: busy || !dirty ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
              title="変更を破棄して元に戻す"
            >
              リセット
            </button>

            <button
              type="button"
              onClick={save}
              disabled={busy || !dirty || isDone}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: busy || !dirty || isDone ? "#141414" : "rgba(59,130,246,.18)",
                color: "#e5e7eb",
                cursor: busy || !dirty || isDone ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
              title={isDone ? "Doneのタスクは更新できません" : "変更を保存"}
            >
              保存
            </button>

            <button
              type="button"
              onClick={() => router.push(`/projects/${projectId}`)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: "#171717",
                color: "#e5e7eb",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              戻る
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
          {/* Meta */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #2a2a2a", color: "#cbd5e1", fontSize: 13 }}>
            {original ? (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div>
                  担当者:{" "}
                  <span style={{ color: "#e5e7eb", fontWeight: 700 }}>
                    {assigneeLabel(original.assigneeUserId)}
                  </span>
                </div>
                <div>作成: {formatDate(original.createdAt)}</div>
                <div>更新: {formatDate(original.updatedAt)}</div>
                <div>
                  状態:{" "}
                  <span style={{ color: "#e5e7eb", fontWeight: 700 }}>
                    {statusLabelJa(original.status)}（{original.status}）
                  </span>
                </div>
                {isDone && <div style={{ color: "#fca5a5" }}>※ Done は更新不可</div>}
              </div>
            ) : (
              <div style={{ color: "#9ca3af" }}>{busy ? "読み込み中…" : "データがありません。"}</div>
            )}
          </div>

          {/* Form */}
          <div style={{ padding: 14, display: "grid", gap: 12 }}>
            {/* Title */}
            <div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>タイトル</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy || isDone}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: "#121212",
                  color: "#e5e7eb",
                  outline: "none",
                  opacity: isDone ? 0.65 : 1,
                }}
              />
            </div>

            {/* Description */}
            <div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>説明</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy || isDone}
                rows={5}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: "#121212",
                  color: "#e5e7eb",
                  outline: "none",
                  resize: "vertical",
                  opacity: isDone ? 0.65 : 1,
                }}
              />
            </div>

            {/* Row */}
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {/* DueDate */}
              <div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>期限（yyyy-MM-dd）</div>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={busy || isDone}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #2a2a2a",
                    background: "#121212",
                    color: "#e5e7eb",
                    outline: "none",
                    opacity: isDone ? 0.65 : 1,
                  }}
                />
              </div>

              {/* Priority */}
              <div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>優先度</div>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  disabled={busy || isDone}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #2a2a2a",
                    background: "#121212",
                    color: "#e5e7eb",
                    outline: "none",
                    opacity: isDone ? 0.65 : 1,
                  }}
                >
                  {priorities.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>状態</div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskState)}
                  disabled={busy || isDone || !original}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #2a2a2a",
                    background: "#121212",
                    color: "#e5e7eb",
                    outline: "none",
                    opacity: busy || isDone ? 0.65 : 1,
                  }}
                  title={isDone ? "Doneのタスクは更新できません" : "状態を変更"}
                >
                  {states.map((s) => (
                    <option key={s} value={s} disabled={original ? !canTransition(original.status, s) : false}>
                      {statusLabelJa(s)}（{s}）
                    </option>
                  ))}
                </select>

                {original && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#9ca3af" }}>
                    現在: {statusLabelJa(original.status)}（{original.status}） / 選択中: {statusLabelJa(status)}（{status}）
                  </div>
                )}
              </div>
            </div>

            {/* Footer note */}
            <div style={{ marginTop: 2, color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
              ※ 許可遷移：ToDo→Doing、Doing→Done/Blocked、Blocked→Doing（同一状態は可）
              <br />
              ※ API側のポリシーにより、Done のタスクは更新できません。
              <br />
              ※ 担当者は「表示のみ」です（変更UIは置いていません）。
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}