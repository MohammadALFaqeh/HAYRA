"use client";
import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isMuted, onMuteChange, setMuted, unlockAudio } from "@/lib/client/sound";
import { cn } from "@/lib/utils";

export function SoundToggle({ className }: { className?: string }) {
  const [muted, setM] = useState(false);
  useEffect(() => {
    setM(isMuted());
    return onMuteChange(setM);
  }, []);
  return (
    <button
      onClick={() => {
        unlockAudio();
        setMuted(!muted);
      }}
      className={cn("rounded-full bg-white/[0.07] p-2.5 text-white/80 hover:bg-white/15", className)}
      aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
      title={muted ? "تشغيل الصوت" : "كتم الصوت"}
    >
      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </button>
  );
}
