"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";

type Me = { userId: number; email: string; displayName: string; role: "Leader" | "Worker" };
type ProjectDetail = { projectId: number; name: string; isArchived: boolean };

export default function NewProjectPage() {
  const r = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");

  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 初期ロードで me を取得（role判定）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setErr(null);
      setBusy(true);
      try {
        const meData = await apiFetch<Me>("/api/v1/users/me");
        if (cancelled) return;
        setMe(meData);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const isLeader = me?.role === "Leader";

  const canSubmit = useMemo(() => {
    if (busy || saving) return false;
    if (!isLeader) return false;
    if (!name.trim()) return false;
    return true;
  }, [busy, saving, isLeader, name]);

  const onSubmit = async () => {
    setErr(null);

    const n = name.trim();
    if (!n) {
      setErr("プロジェクト名を入力してください。");
      return;
    }
    if (!isLeader) {
      setErr("この操作はリーダーのみ可能です。");
      return;
    }

    try {
      setSaving(true);

      const created = await apiFetch<ProjectDetail>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({ name: n }),
      });

      // 一覧へ戻る（作成した案件を見せたいなら /projects/{id} に飛ばしてもOK）
      r.push("/projects");
      r.refresh();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        background: "#121212",
        color: "#e5e7eb",
      }}
    >
      <div style={{ maxWidth: 720, margin: "28px auto" }}>
        <header style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>案件新規作成</h1>
              <p style={{ margin: "6px 0 0", color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>
                プロジェクト名を入力して作成します（Leaderのみ）。
              </p>
            </div>

            <Link
              href="/projects"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: "#171717",
                color: "#e5e7eb",
                textDecoration: "none",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              ← 一覧へ戻る
            </Link>
          </div>
        </header>

        {err && (
          <section
            role="alert"
            style={{
              marginBottom: 12,
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
            borderRadius: 16,
            border: "1px solid #2a2a2a",
            background: "#1a1a1a",
            boxShadow: "0 16px 50px rgba(0,0,0,.35)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 14, borderBottom: "1px solid #2a2a2a" }}>
            <div style={{ color: "#cbd5e1", fontSize: 13 }}>
              {busy
                ? "読み込み中…"
                : me
                  ? `ログイン中: ${me.displayName?.trim() ? me.displayName : me.email}（${me.role}）`
                  : "ログイン情報を取得できませんでした"}
            </div>
          </div>

          <div style={{ padding: 14, display: "grid", gap: 12 }}>
            {/* 権限ガード（UI側） */}
            {!busy && me && !isLeader && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "rgba(59,130,246,.10)",
                  border: "1px solid rgba(59,130,246,.25)",
                  color: "#dbeafe",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                この画面はリーダーのみ作成できます。必要であれば管理者へご連絡ください。
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: 12, color: "#cbd5e1" }}>
                プロジェクト名
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit();
                }}
                placeholder="例）社内ツール刷新、A社向け開発 など"
                disabled={busy || saving || !isLeader}
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: busy || saving || !isLeader ? "#141414" : "#171717",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />
              <div style={{ marginTop: 6, color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
                ※ 作成後は一覧から詳細へ移動できます。
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => r.push("/projects")}
                disabled={saving}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: "#171717",
                  color: "#e5e7eb",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 12,
                }}
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(16,185,129,.28)",
                  background: canSubmit ? "rgba(16,185,129,.14)" : "#141414",
                  color: canSubmit ? "#d1fae5" : "#9ca3af",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {saving ? "作成中…" : "作成する"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}