import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SettingsStep } from "./SettingsStep";

export const metadata: Metadata = { title: "إعدادات اللعبة" };

export default function SettingsPage() {
  return (
    <>
      <SiteHeader />
      <SettingsStep />
    </>
  );
}
