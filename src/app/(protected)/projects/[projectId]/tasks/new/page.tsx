"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { FullScreenLoading } from "@/components/FullScreenLoading";

type TaskPriority = "High" | "Medium" | "Low";
type MeResponse = {
  userId: number;
  email: string;
  displayName: string;
  role: "Leader" | "Worker";
  roleId?: string | null;
};

type ProjectMemberDto = {
  userId: number;
  displayName: string;
  email: string;
};

const priorities: TaskPriority[] = ["High", "Medium", "Low"];

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

export default function NewTaskPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = Number(params.projectId);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [members, setMembers] = useState<ProjectMemberDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<string>(""); // yyyy-mm-dd
  const [priority, setPriority] = useState<TaskPriority>("Medium");
  const [assigneeUserId, setAssigneeUserId] = useState<string>(""); // Leader用 select（""=未割当）

  // modal
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dateRef = useRef<HTMLInputElement>(null);

  const isLeader = me?.role === "Leader";

  const canCreate = useMemo(() => {
    if (!me) return false;
    if (me.role === "Leader") return true;
    // Worker は「案件メンバーのみ」
    return members.some((m) => m.userId === me.userId);
  }, [me, members]);

  const assigneeLabel = useMemo(() => {
    if (!isLeader) return "未割当（Workerは固定）";
    if (!assigneeUserId) return "未割当";
    const m = members.find((x) => String(x.userId) === assigneeUserId);
    return m ? `${m.displayName}（${m.email}）` : `userId=${assigneeUserId}`;
  }, [assigneeUserId, isLeader, members]);

  async function loadMe() {
    try {
      const data = await apiFetch<MeResponse>("/api/v1/users/me");
      setMe(data);
    } catch {
      setMe(null);
    }
  }

  async function loadMembers() {
    try {
      const data = await apiFetch<ProjectMemberDto[]>(`/api/v1/projects/${projectId}/members`);
      setMembers(data);
    } catch {
      setMembers([]);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(projectId) || projectId <= 0) return;
    setErr(null);
    setBusy(true);
    Promise.all([loadMe(), loadMembers()])
      .catch(() => {})
      .finally(() => setBusy(false));
  }, [projectId]);

  function openConfirm() {
    setErr(null);

    const t = title.trim();
    if (!t) {
      setErr("タイトルは必須です。");
      return;
    }
    if (!canCreate) {
      setErr("この案件のメンバーではないため、タスクを作成できません。");
      return;
    }
    setConfirmOpen(true);
  }

  async function doSubmit() {
    setErr(null);

    const t = title.trim();
    if (!t) {
      setErr("タイトルは必須です。");
      return;
    }

    // Worker は未割当固定（assignee=null）
    // Leader は未割当 or 案件メンバーから選択
    const body = {
      projectId,
      title: t,
      description: description.trim() ? description.trim() : null,
      assigneeUserId: isLeader ? (assigneeUserId ? Number(assigneeUserId) : null) : null,
      dueDate: dueDate ? dueDate : null, // "YYYY-MM-DD"
      priority,
    };

    setBusy(true);
    try {
      await apiFetch(`/api/v1/tasks`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      // 今回は /projects/${projectId} が一覧画面、とのことなので維持
      router.push(`/projects/${projectId}`);
    } catch (e: any) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: 16, background: "#121212", color: "#e5e7eb" }}>
      <FullScreenLoading show={busy} label="処理中…" subLabel="ユーザー情報 / メンバー情報を取得しています" />
      <div style={{ maxWidth: 720, margin: "28px auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
              ← 戻る
            </Link>

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

          <button
            type="button"
            onClick={openConfirm}
            disabled={busy || !canCreate}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(59,130,246,.35)",
              background: busy || !canCreate ? "#141414" : "rgba(59,130,246,.14)",
              color: "#dbeafe",
              cursor: busy || !canCreate ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
            title={!canCreate ? "この案件のメンバーではないため作成できません" : "タスクを作成"}
          >
            {busy ? "作成中…" : "作成"}
          </button>
        </header>

        <h1 style={{ margin: "14px 0 6px", fontSize: 26, fontWeight: 800 }}>タスク新規作成</h1>

        <p style={{ margin: 0, color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>
          Worker は担当者を指定できません（未割当で登録されます）。作成時の状態は ToDo です。
        </p>

        {err && (
          <section
            role="alert"
            style={{
              marginTop: 14,
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

        <section
          style={{
            marginTop: 14,
            borderRadius: 16,
            border: "1px solid #2a2a2a",
            background: "#1a1a1a",
            boxShadow: "0 16px 50px rgba(0,0,0,.35)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 14, borderBottom: "1px solid #2a2a2a" }}>
            <div style={{ color: "#cbd5e1", fontSize: 13 }}>入力</div>
          </div>

          <div style={{ padding: 14, display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>タイトル（必須）</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：ログイン画面の入力チェック追加"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: "#121212",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>説明</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="任意"
                rows={4}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: "#121212",
                  color: "#e5e7eb",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#cbd5e1" }}>期限（yyyy-mm-dd）</span>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    ref={dateRef}
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #2a2a2a",
                      background: "#121212",
                      color: "#e5e7eb",
                      outline: "none",
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => dateRef.current?.showPicker?.()}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #2a2a2a",
                      background: "#171717",
                      color: "#e5e7eb",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    title="カレンダーを開く（対応ブラウザのみ）"
                  >
                    📅
                  </button>
                </div>

                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  ※ ブラウザによりカレンダー表示は自動です。📅ボタンは対応時のみ強制表示します。
                </span>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#cbd5e1" }}>優先度</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #2a2a2a",
                    background: "#121212",
                    color: "#e5e7eb",
                    outline: "none",
                  }}
                >
                  {priorities.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Leaderだけ担当者選択を出す（Workerは未割当固定） */}
            {isLeader && (
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#cbd5e1" }}>担当者（Leaderのみ）</span>
                <select
                  value={assigneeUserId}
                  onChange={(e) => setAssigneeUserId(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #2a2a2a",
                    background: "#121212",
                    color: "#e5e7eb",
                    outline: "none",
                  }}
                >
                  <option value="">未割当</option>
                  {members.map((m) => (
                    <option key={m.userId} value={String(m.userId)}>
                      {m.displayName}（{m.email}）
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!canCreate && (
              <div style={{ fontSize: 12, color: "#fca5a5" }}>
                この案件のメンバーではないため、タスクを作成できません。
              </div>
            )}
          </div>

          <div
            style={{
              padding: 14,
              borderTop: "1px solid #2a2a2a",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Link
              href={`/projects/${projectId}`}
              style={{
                color: "#cbd5e1",
                textDecoration: "none",
                border: "1px solid #2a2a2a",
                background: "#171717",
                padding: "10px 12px",
                borderRadius: 12,
              }}
            >
              キャンセル
            </Link>

            <button
              type="button"
              onClick={openConfirm}
              disabled={busy || !canCreate}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(59,130,246,.35)",
                background: busy || !canCreate ? "#141414" : "rgba(59,130,246,.14)",
                color: "#dbeafe",
                cursor: busy || !canCreate ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "作成中…" : "作成"}
            </button>
          </div>
        </section>

        <p style={{ marginTop: 12, color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
          ※ 作成後は <code>/projects/{projectId}</code>（あなたの一覧画面）に戻ります。<br />
          ※ <code>assigneeUserId</code> は Worker の場合常に null で送信します。
        </p>
      </div>

      {/* ===== Confirm Modal ===== */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setConfirmOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              borderRadius: 16,
              border: "1px solid #2a2a2a",
              background: "#171717",
              boxShadow: "0 18px 60px rgba(0,0,0,.5)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 14, borderBottom: "1px solid #2a2a2a" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#e5e7eb" }}>作成確認</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
                この内容でタスクを作成します。よろしいですか？
              </div>
            </div>

            <div style={{ padding: 14, display: "grid", gap: 10 }}>
              <div
                style={{
                  border: "1px solid #2a2a2a",
                  background: "#121212",
                  borderRadius: 14,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <Row label="タイトル" value={title.trim() || "-"} />
                <Row label="期限" value={dueDate || "-"} />
                <Row label="優先度" value={priority} />
                <Row label="担当" value={assigneeLabel} />
                {description.trim() ? <Row label="説明" value={description.trim()} /> : <Row label="説明" value="-" />}
              </div>

              {!canCreate && (
                <div style={{ fontSize: 12, color: "#fca5a5" }}>
                  この案件のメンバーではないため、作成できません。
                </div>
              )}
            </div>

            <div
              style={{
                padding: 14,
                borderTop: "1px solid #2a2a2a",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: busy ? "#141414" : "#1a1a1a",
                  color: "#e5e7eb",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={doSubmit}
                disabled={busy || !canCreate}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(59,130,246,.35)",
                  background: busy || !canCreate ? "#141414" : "rgba(59,130,246,.14)",
                  color: "#dbeafe",
                  cursor: busy || !canCreate ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "作成中…" : "OK（作成）"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 10, alignItems: "start" }}>
      <div style={{ fontSize: 12, color: "#9ca3af" }}>{props.label}</div>
      <div style={{ fontSize: 13, color: "#e5e7eb", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {props.value}
      </div>
    </div>
  );
}