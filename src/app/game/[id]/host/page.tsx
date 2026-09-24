import type { Metadata } from "next";
import { HostPanel } from "@/components/game/HostPanel";

export const metadata: Metadata = { title: "لوحة المضيف" };

export default async function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HostPanel sessionId={id} />;
}
