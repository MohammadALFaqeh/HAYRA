import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { POWERUPS, MYSTERY } from "@/lib/game/constants";

export const metadata: Metadata = { title: "طريقة اللعب" };

const STEPS = [
  ["جهّزوا الشاشة", "افتح اللعبة من جوالك (المضيف)، ثم امسح رمز «ربط التلفزيون» أو افتح رابط العرض على التلفزيون أو اللابتوب."],
  ["اختاروا الفرق والفئات", "اكتبوا أسماء الفريقين، حددوا الوقت والمستوى، واختاروا من 3 إلى 8 فئات أو باقة جاهزة."],
  ["اختيار السؤال", "الفريق صاحب الدور يختار فئة وقيمة (100 أو 300 أو 500 — كل قيمة مرتين، سؤال لكل فريق). كلما زادت القيمة زادت صعوبة السؤال وعمقه."],
  ["الإجابة", "المضيف يرى الإجابة على جواله فقط. إذا كانت صحيحة يضغط «صح» فتُضاف النقاط مع تعليق مضحك على الشاشة."],
  ["السرقة", "إذا أخطأ الفريق أو ضغط المضيف «تحويل»، يحصل الفريق الآخر على وقت قصير لسرقة السؤال ونقاطه."],
  ["الدور", "بعد كل سؤال ينتقل الدور للفريق الآخر لاختيار السؤال التالي."],
  ["ملك الثواني 👑", "فقرة خاصة يفتحها المضيف في أي وقت من اللوحة: عداد يظهر لحظة ثم يختفي، وعندما يتوقف يقدّر الفريق كم ثانية مرّت. الهامش المسموح: سهل ±0.30 ث، متوسط ±0.20 ث، صعب ±0.10 ث، وإذا أخطأ يمكن تحويلها للخصم."],
  ["السؤال النهائي", "بعد انتهاء اللوحة، كل فريق يراهن سرًّا بجزء من نقاطه. صح = يربح الرهان، خطأ = يخسره."],
];

export default function HowToPlay() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-10 px-5 pb-20">
        <h1 className="font-display text-5xl font-extrabold">طريقة اللعب</h1>
        <ol className="space-y-4">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="panel flex gap-4 p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold-400 font-display text-xl font-extrabold text-night-950">{i + 1}</span>
              <div>
                <h2 className="font-display text-xl font-bold">{t}</h2>
                <p className="text-white/70">{d}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="space-y-3">
          <h2 className="font-display text-3xl font-extrabold">وسائل المساعدة</h2>
          <p className="text-white/60">كل فريق يستخدم كل وسيلة مرة واحدة فقط في اللعبة، والمضيف يفعّلها من جواله.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.values(POWERUPS).map((p) => (
              <div key={p.name} className="rounded-2xl bg-white/[0.05] p-4">
                <div className="font-bold">
                  {p.icon} {p.name}
                </div>
                <div className="text-sm text-white/60">{p.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-3xl font-extrabold">الخانات الغامضة ؟</h2>
          <p className="text-white/60">بعض الخانات مخفية، ولا تعرفون ما بداخلها حتى تفتحوها:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.values(MYSTERY).map((m) => (
              <div key={m.name} className="rounded-2xl bg-violet-500/10 p-4">
                <div className="font-bold">
                  {m.icon} {m.name}
                </div>
                <div className="text-sm text-white/60">{m.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-3xl font-extrabold">تحديات QR 📱</h2>
          <p className="text-white/70">
            في تحديات مثل «مثّلها» و«ارسم» و«وصف بدون الكلمة»، يظهر رمز QR على الشاشة. شخص واحد من الفريق يمسحه فتظهر له الكلمة السرية على جواله فقط، والرمز يتعطل تلقائيًا بعد انتهاء السؤال.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-3xl font-extrabold">السلسلة 🔥</h2>
          <p className="text-white/70">إذا أجاب فريق عدة أسئلة صحيحة متتالية (3 افتراضيًا) يحصل على نقاط مكافأة. يمكن إيقافها من الإعدادات.</p>
        </section>

        <Link href="/play/new" className="block rounded-[1.4rem] bg-gold-400 py-4 text-center font-display text-xl font-extrabold text-night-950">
          يلا نبدأ!
        </Link>
      </main>
    </>
  );
}
