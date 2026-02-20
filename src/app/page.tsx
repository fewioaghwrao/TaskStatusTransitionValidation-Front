import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function Home() {
  const cookieStore = await cookies(); // ✅ Promiseなのでawait
  const token = cookieStore.get("token")?.value;

  redirect(token ? "/projects" : "/login");
}

