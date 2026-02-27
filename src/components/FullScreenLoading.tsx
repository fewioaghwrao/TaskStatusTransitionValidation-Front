"use client";

type Props = {
  show: boolean;
  label?: string;
  subLabel?: string;
};

export function FullScreenLoading({ show, label, subLabel }: Props) {
  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          width: 380,
          maxWidth: "92vw",
          borderRadius: 16,
          border: "1px solid #2a2a2a",
          background: "#171717",
          color: "#e5e7eb",
          padding: 16,
          boxShadow: "0 16px 50px rgba(0,0,0,.5)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            aria-hidden
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              border: "2px solid rgba(255,255,255,.25)",
              borderTopColor: "rgba(255,255,255,.85)",
              animation: "spin 0.9s linear infinite",
            }}
          />
          <div style={{ fontWeight: 800, fontSize: 14 }}>
            {label ?? "読み込み中…"}
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
          {subLabel ?? "ネットワーク状況により時間がかかる場合があります。"}
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}