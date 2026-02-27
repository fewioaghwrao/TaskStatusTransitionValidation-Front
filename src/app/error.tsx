"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: Sentry等に送るならここ
    console.error(error);
  }, [error]);

  return (
    <main style={{ minHeight: "100vh", padding: 16, background: "#121212", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 720, margin: "28px auto" }}>
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
            <div style={{ fontSize: 12, color: "#9ca3af" }}>Unexpected error</div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900 }}>予期せぬエラーが発生しました</div>
            <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 13, lineHeight: 1.7 }}>
              一時的な不具合の可能性があります。再試行するか、別画面へ戻ってください。
            </div>

            {/* 開発中だけ出したいなら NODE_ENV でガードしてもOK */}
            <pre
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: "#121212",
                border: "1px solid #2a2a2a",
                color: "#cbd5e1",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                overflowX: "auto",
              }}
            >
              {error?.message ?? String(error)}
              {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
            </pre>
          </div>

          <div style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(59,130,246,.35)",
                background: "rgba(59,130,246,.14)",
                color: "#dbeafe",
                cursor: "pointer",
              }}
            >
              再試行
            </button>

            <Link
              href="/projects"
              style={{
                color: "#cbd5e1",
                textDecoration: "none",
                border: "1px solid #2a2a2a",
                background: "#171717",
                padding: "10px 12px",
                borderRadius: 12,
              }}
            >
              案件一覧へ
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}