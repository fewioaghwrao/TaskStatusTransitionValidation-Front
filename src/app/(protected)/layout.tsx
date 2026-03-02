"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const r = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // localStorage を読めるのはクライアントのみ
    const token = localStorage.getItem("token");
    if (!token) {
      r.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setReady(true);
  }, [r, pathname]);

  // ログイン判定前は何も表示しない（必要ならローディングに変えてOK）
  if (!ready) return null;

  return <>{children}</>;
}