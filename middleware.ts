import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"]; // 認証なしで見せるページ
const PUBLIC_PREFIXES = ["/_next", "/favicon.ico", "/assets"]; // 静的/Next内部

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Next内部や静的ファイルは素通し
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 認証不要ページは素通し
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // ✅ token 判定（いま localStorage なので、まずは cookie に寄せるのが正道）
  const token = req.cookies.get("token")?.value;

  // token なし → /loginへ
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // どこから来たか残す（ログイン後に戻せる）
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api).*)"], // api は除外（必要なら変える）
};
