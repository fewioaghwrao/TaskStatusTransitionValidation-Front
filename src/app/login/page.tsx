"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function LoginPage() {
  const r = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (!email.trim() || !password) return false;
    if (!isValidEmail(email.trim())) return false;
    return true;
  }, [email, password, busy]);

  const onSubmit = async () => {
    setErr(null);

    // 軽いクライアント側バリデーション
    const e = email.trim();
    if (!e || !password) {
      setErr("メールアドレスとパスワードを入力してください。");
      return;
    }
    if (!isValidEmail(e)) {
      setErr("メールアドレスの形式が正しくありません。");
      return;
    }

    try {
      setBusy(true);
      await login(e, password);
      r.push("/projects");
      r.refresh(); // App Routerでセッション反映させたいとき用（不要なら消してOK）
    } catch (ex: any) {
      setErr(ex?.message ?? "ログインに失敗しました。入力内容をご確認ください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background:
          "radial-gradient(900px 400px at 10% 0%, rgba(99,102,241,.18), transparent 50%)," +
          "radial-gradient(900px 400px at 90% 0%, rgba(16,185,129,.14), transparent 50%)," +
          "linear-gradient(180deg, #0b1020 0%, #0b1020 35%, #0a0f1c 100%)"
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        {/* Brand / Header */}
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.10)"
            }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "linear-gradient(90deg, #6366f1, #10b981)"
              }}
            />
            <span style={{ color: "rgba(255,255,255,.85)", fontSize: 12 }}>
              小規模チーム向け 案件・タスク管理
            </span>
          </div>

          <h1
            style={{
              marginTop: 12,
              marginBottom: 6,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "rgba(255,255,255,.92)"
            }}
          >
            サインイン
          </h1>
          <p style={{ margin: 0, color: "rgba(255,255,255,.65)", fontSize: 13, lineHeight: 1.6 }}>
            案件とタスクの進捗を一元管理し、チームでの共有をスムーズにします。
          </p>
        </div>

        {/* Card */}
        <section
          style={{
            borderRadius: 16,
            padding: 18,
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.10)",
            boxShadow: "0 12px 40px rgba(0,0,0,.35)"
          }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,.75)" }}
              >
                メールアドレス
              </label>
              <input
                id="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit();
                }}
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "12px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.14)",
                  outline: "none",
                  background: "rgba(15, 23, 42, .55)",
                  color: "rgba(255,255,255,.92)"
                }}
              />
              {!email || isValidEmail(email.trim()) ? null : (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "rgba(248,113,113,.95)" }}>
                  メール形式が不正です。
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,.75)" }}
              >
                パスワード
              </label>

              <div style={{ position: "relative", marginTop: 6 }}>
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSubmit();
                  }}
                  style={{
                    width: "100%",
                    padding: "12px 44px 12px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,.14)",
                    outline: "none",
                    background: "rgba(15, 23, 42, .55)",
                    color: "rgba(255,255,255,.92)"
                  }}
                />

                {/* ✅ 表示/非表示 */}
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "パスワードを非表示" : "パスワードを表示"}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,.12)",
                    background: "rgba(255,255,255,.06)",
                    color: "rgba(255,255,255,.85)",
                    cursor: "pointer"
                  }}
                >
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Error */}
            {err && (
              <div
                role="alert"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(248,113,113,.10)",
                  border: "1px solid rgba(248,113,113,.25)",
                  color: "rgba(254,226,226,.95)",
                  fontSize: 13,
                  lineHeight: 1.6
                }}
              >
                {err}
              </div>
            )}

            {/* Submit */}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              style={{
                marginTop: 4,
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.12)",
                background: canSubmit
                  ? "linear-gradient(90deg, rgba(99,102,241,.95), rgba(16,185,129,.95))"
                  : "rgba(255,255,255,.10)",
                color: "rgba(255,255,255,.95)",
                fontWeight: 800,
                cursor: canSubmit ? "pointer" : "not-allowed",
                boxShadow: canSubmit ? "0 10px 30px rgba(0,0,0,.25)" : "none"
              }}
            >
              {busy ? "ログイン中…" : "ログイン"}
            </button>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 4,
                fontSize: 12,
                color: "rgba(255,255,255,.65)"
              }}
            >
              <span>※ アカウントをお持ちでない場合は管理者へご連絡ください。</span>
              {/* 将来 /auth/forgot など作るならここに */}
              <span style={{ opacity: 0.7 }}>v0.1</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
