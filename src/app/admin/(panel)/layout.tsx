import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata: Metadata = { title: { default: "لوحة الإدارة", template: "%s | إدارة حيرة" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AdminNav email={user.email ?? ""} />
      <div className="min-w-0 flex-1 p-4 lg:p-8">{children}</div>
    </div>
  );
}
