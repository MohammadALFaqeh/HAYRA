import type { Metadata } from "next";
import { TvView } from "@/components/game/TvView";

export const metadata: Metadata = { title: "شاشة العرض" };

export default async function TvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TvView sessionId={id} />;
}
