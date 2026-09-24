"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { getDeviceId } from "@/lib/client/storage";
import { hintServerTime, useCountdown } from "@/lib/client/clock";
import { Logo } from "@/components/ui/Logo";
import { Spinner } from "@/components/ui";
import type { TimerState } from "@/lib/game/types";
import { cn, seconds, TEAM_COLORS } from "@/lib/utils";

interface Challenge {
  type: string;
  typeName: string;
  prompt: string;
  secret: string;
  instructions: string | null;
  forbidden: string[];
  clues: string[];
  imageUrl: string | null;
  audioUrl: string | null;
  teamName: string;
  teamId: "A" | "B";
  points: number;
}
type Resp = { status: "ok"; challenge: Challenge; timer: TimerState; serverTime: number } | { status: "expired" | "claimed" };

const DEFAULT_HINT: Record<string, string> = {
  qr_acting: "مثّل الكلمة بدون كلام ولا أصوات 🎭",
  qr_drawing: "ارسمها على ورقة بدون حروف أو أرقام ✏️",
  qr_describe: "اشرحها بالكلام بدون ما تقول الكلمة أو الكلمات الممنوعة 🗣️",
  qr_secret: "خلّي فريقك يخمّن الكلمة بطريقتك — بدون ما تقولها 🤫",
  qr_who_am_i: "أنت هذه الشخصية! جاوب فريقك بـ «نعم» أو «لا» فقط 🕵️",
  qr_sound: "قلّد الصوت فقط — ممنوع الكلام 🔊",
  qr_movement: "نفّذ الحركة وخلّي فريقك يخمّن 🤸",
};

export function QrChallenge({ token }: { token: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const device = getDeviceId();
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/qr/${token}?device=${device}`, { cache: "no-store" });
        const j = (await res.json()) as Resp;
        if (stop) return;
        if (j.status === "ok") hintServerTime(j.serverTime);
        setData(j);
        if (j.status !== "ok") stop = true;
      } catch {
        /* نعيد المحاولة */
      }
    };
    void load();
    // نتحقق كل 3 ثوانٍ: إذا انتهى السؤال يختفي السر فورًا
    const i = setInterval(() => !stop && load(), 3000);
    return () => {
      stop = true;
      clearInterval(i);
    };
  }, [token]);

  const timer = data?.status === "ok" ? data.timer : null;
  const remaining = useCountdown(timer);

  if (!data) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Spinner label="جارٍ فتح التحدي…" />
      </main>
    );
  }
  if (data.status !== "ok") {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="space-y-5">
          <Logo size={150} />
          <div className="text-6xl">{data.status === "claimed" ? "🔒" : "⌛"}</div>
          <h1 className="font-display text-3xl font-extrabold">{data.status === "claimed" ? "تم فتح هذا التحدي على جهاز آخر" : "انتهت هذه الجولة"}</h1>
          <p className="text-white/60">{data.status === "claimed" ? "إذا كان هذا خطأ، اطلب من المضيف «إعادة ضبط QR»." : "ارجعوا للشاشة وتابعوا اللعب 🎮"}</p>
        </div>
      </main>
    );
  }

  const c = data.challenge;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-5">
      <header className="flex items-center justify-between">
        <span className={cn("rounded-full bg-white/10 px-3 py-1 text-sm font-bold", TEAM_COLORS[c.teamId].text)}>{c.teamName}</span>
        {timer?.label && <span className="font-display text-3xl font-extrabold tabular-nums text-gold-300">{seconds(remaining)}</span>}
      </header>
      <div className="text-center">
        <div className="text-sm text-white/55">{c.typeName}</div>
        <h1 className="font-display text-2xl font-bold">{c.prompt}</h1>
      </div>

      <button onClick={() => setHidden((h) => !h)} className="panel relative flex min-h-[40dvh] flex-col items-center justify-center gap-3 p-6 text-center">
        {hidden ? (
          <>
            <EyeOff className="h-10 w-10 text-white/40" />
            <span className="text-white/50">مخفي — اضغط للإظهار</span>
          </>
        ) : (
          <>
            <span className="text-xs text-white/40">🤫 السر (لك فقط)</span>
            <span className="gold-text font-display text-5xl font-extrabold leading-tight">{c.secret}</span>
            {c.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.imageUrl} alt="" className="max-h-48 rounded-2xl" />
            )}
            {c.audioUrl && <audio src={c.audioUrl} controls className="w-full" />}
            <span className="mt-2 flex items-center gap-1 text-xs text-white/40">
              <Eye className="h-3.5 w-3.5" /> اضغط للإخفاء
            </span>
          </>
        )}
      </button>

      <div className="rounded-2xl bg-white/[0.05] p-4 text-lg">{c.instructions || DEFAULT_HINT[c.type] || "خلّي فريقك يعرف الإجابة بدون ما تقولها!"}</div>
      {c.forbidden.length > 0 && (
        <div className="rounded-2xl border border-wine-400/40 bg-wine-500/10 p-4">
          <div className="mb-2 font-bold text-wine-400">🚫 ممنوع تقول:</div>
          <div className="flex flex-wrap gap-2">
            {c.forbidden.map((w) => (
              <span key={w} className="rounded-full bg-wine-500/25 px-3 py-1">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
      {c.clues.length > 0 && (
        <ul className="space-y-1 text-white/70">
          {c.clues.map((x, i) => (
            <li key={i}>• {x}</li>
          ))}
        </ul>
      )}
      <p className="mt-auto text-center text-xs text-white/35">لا تورّي الشاشة لفريقك 😉 الصفحة تغلق تلقائيًا عند انتهاء السؤال</p>
    </main>
  );
}
