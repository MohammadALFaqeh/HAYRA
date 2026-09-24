import type { Metadata } from "next";
import { QrChallenge } from "./QrChallenge";

export const metadata: Metadata = { title: "تحدي QR" };

export default async function QrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <QrChallenge token={token} />;
}
