import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { TeamsStep } from "./TeamsStep";

export const metadata: Metadata = { title: "لعبة جديدة" };

export default function NewGamePage() {
  return (
    <>
      <SiteHeader />
      <Suspense>
        <TeamsStep />
      </Suspense>
    </>
  );
}
