import Link from "next/link";

export default function NotFound() {
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
            <div style={{ fontSize: 12, color: "#9ca3af" }}>404</div>
            <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900 }}>ページが見つかりません</div>
            <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 13, lineHeight: 1.7 }}>
              URLが間違っているか、対象が削除/アーカイブされた可能性があります。
            </div>
          </div>

          <div style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
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

            <Link
              href="/"
              style={{
                color: "#dbeafe",
                textDecoration: "none",
                border: "1px solid rgba(59,130,246,.35)",
                background: "rgba(59,130,246,.14)",
                padding: "10px 12px",
                borderRadius: 12,
              }}
            >
              ホームへ
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}