import type { Metadata } from "next";
import { TvView } from "@/components/game/TvView";

export const metadata: Metadata = { title: "وضع المتفرج" };

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TvView sessionId={id} spectator />;
}
