const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!baseUrl) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
}

export type AuthTokenResponse = { token: string };

type ProblemDetails = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
};

function isProbablyJson(contentType: string | null) {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct.includes("application/json") || ct.includes("application/problem+json");
}

async function readErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type");

  // JSON / ProblemDetails を優先して読む
  if (isProbablyJson(contentType)) {
    try {
      const body = (await res.json()) as any;

      // ProblemDetails 想定
      const pd = body as ProblemDetails;
      const detail = pd?.detail || pd?.title;

      // 401 はユーザー向けに固定文言に寄せるのが無難（情報漏えい防止にも合う）
      if (res.status === 401) {
        return "メールアドレスまたはパスワードが違います。";
      }

      if (detail) return String(detail);

      // ValidationProblemDetails など
      if (pd?.errors) {
        const first = Object.values(pd.errors).flat()[0];
        if (first) return String(first);
      }

      // その他JSON
      return typeof body === "string" ? body : JSON.stringify(body);
    } catch {
      // fallthrough
    }
  }

  // 非JSONはテキスト
  const text = await res.text().catch(() => "");
  if (res.status === 401) {
    return "メールアドレスまたはパスワードが違います。";
  }
  return text || `HTTP ${res.status}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers = new Headers(init.headers);

  // body があるときだけ Content-Type を付ける（GET 等で余計な指定を避ける）
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });

  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type");
  if (isProbablyJson(contentType)) {
    return (await res.json()) as T;
  }

  // JSONでない成功レスポンスが来た場合
  return (await res.text()) as unknown as T;
}

export async function login(email: string, password: string) {
  const data = await apiFetch<AuthTokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  localStorage.setItem("token", data.token);

  // ✅ middleware用にcookieへ（簡易版）
  document.cookie = `token=${encodeURIComponent(data.token)}; path=/; SameSite=Lax`;
}

export function logout() {
  localStorage.removeItem("token");
  document.cookie = "token=; path=/; Max-Age=0; SameSite=Lax";
}
