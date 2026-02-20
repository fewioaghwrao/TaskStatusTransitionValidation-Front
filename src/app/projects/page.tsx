"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, logout } from "@/lib/api";
import { useRouter } from "next/navigation";

type Project = { projectId: number; name: string; isArchived: boolean };
type Me = { userId: number; email: string; displayName: string };

export default function ProjectsPage() {
  const r = useRouter();
  const [items, setItems] = useState<Project[]>([]);
  const [me, setMe] = useState<Me | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const active = useMemo(() => items.filter((x) => !x.isArchived), [items]);
  const archived = useMemo(() => items.filter((x) => x.isArchived), [items]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setErr(null);
      setBusy(true);
      try {
        const [meData, projects] = await Promise.all([
          apiFetch<Me>("/api/v1/users/me"),
          apiFetch<Project[]>("/api/v1/projects"),
        ]);

        if (cancelled) return;
        setMe(meData);
        setItems(projects);
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

  const onLogout = () => {
    logout();
    r.push("/login");
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
      <div style={{ maxWidth: 980, margin: "28px auto" }}>
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
          <div>
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
              小規模チーム向け 案件・タスク管理
            </div>

            <h1 style={{ margin: "10px 0 6px", fontSize: 26, fontWeight: 800 }}>
              案件一覧
            </h1>

            <p style={{ margin: 0, color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>
              参画中の案件を確認し、タスクの状態遷移ルールをチェックできます。
            </p>
          </div>

          {/* ✅ 右上：ユーザー名 + ログアウト */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {me && (
              <div
                title={me.email}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #2a2a2a",
                  background: "#171717",
                  color: "#cbd5e1",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  maxWidth: 260,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {me.displayName?.trim() ? me.displayName : me.email}
              </div>
            )}

            <button
              type="button"
              onClick={onLogout}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: "#1a1a1a",
                color: "#e5e7eb",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ログアウト
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

        {/* Content Card */}
        <section
          style={{
            borderRadius: 16,
            border: "1px solid #2a2a2a",
            background: "#1a1a1a",
            boxShadow: "0 16px 50px rgba(0,0,0,.35)",
            overflow: "hidden",
          }}
        >
          {/* Top bar */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid #2a2a2a",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ color: "#cbd5e1", fontSize: 13 }}>
              {busy ? "読み込み中…" : `${active.length} 件（アーカイブ ${archived.length} 件）`}
            </div>

            <button
              type="button"
              onClick={() => r.refresh()}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #2a2a2a",
                background: "#171717",
                color: "#e5e7eb",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              再読み込み
            </button>
          </div>

          <div style={{ padding: 14 }}>
            {/* Loading */}
            {busy && (
              <div style={{ display: "grid", gap: 10 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 52,
                      borderRadius: 14,
                      border: "1px solid #2a2a2a",
                      background:
                        "linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.02), rgba(255,255,255,.04))",
                    }}
                  />
                ))}
              </div>
            )}

            {/* Empty */}
            {!busy && items.length === 0 && !err && (
              <div
                style={{
                  padding: 22,
                  borderRadius: 16,
                  border: "1px dashed #2a2a2a",
                  background: "#171717",
                  color: "#cbd5e1",
                }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>案件がまだありません</p>
                <p style={{ margin: "6px 0 0", color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>
                  APIが空配列を返しているか、参照権限がない可能性があります。
                </p>
              </div>
            )}

            {/* List */}
            {!busy && items.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                {active.map((p) => (
                  <ProjectRow key={p.projectId} p={p} />
                ))}

                {archived.length > 0 && (
                  <>
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: "1px solid #2a2a2a",
                        color: "#9ca3af",
                        fontSize: 12,
                        letterSpacing: ".02em",
                      }}
                    >
                      アーカイブ
                    </div>
                    {archived.map((p) => (
                      <ProjectRow key={p.projectId} p={p} />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Footnote */}
            <p style={{ margin: "14px 2px 0", color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
              ※ エラーになる場合は、API のエンドポイント名 / Authorize / CORS / Cookie(token) を確認してください。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProjectRow({ p }: { p: Project }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 12px",
        borderRadius: 14,
        border: "1px solid #2a2a2a",
        background: "#171717",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Link
          href={`/projects/${p.projectId}`}
          style={{
            color: "#e5e7eb",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          {p.name}
        </Link>
        <div style={{ marginTop: 4, color: "#9ca3af", fontSize: 12 }}>
          Project ID: {p.projectId}
        </div>
      </div>

      {p.isArchived ? (
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #2a2a2a",
            background: "#111111",
            color: "#cbd5e1",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          アーカイブ
        </span>
      ) : (
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(16,185,129,.28)",
            background: "rgba(16,185,129,.10)",
            color: "#d1fae5",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          進行中
        </span>
      )}
    </div>
  );
}
