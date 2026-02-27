"use client";

type Props = {
  message: string | null;
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorCard({ message, title, onRetry, retryLabel }: Props) {
  if (!message) return null;

  return (
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
      <div style={{ fontWeight: 900, marginBottom: 6 }}>
        {title ?? "エラーが発生しました"}
      </div>

      <div>{message}</div>

      {onRetry && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: "9px 10px",
              borderRadius: 12,
              border: "1px solid rgba(239,68,68,.35)",
              background: "rgba(239,68,68,.12)",
              color: "#fee2e2",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {retryLabel ?? "再試行"}
          </button>
        </div>
      )}
    </section>
  );
}