// ============================================================
// تعليقات حيرة — تظهر على التلفزيون بعد كل نتيجة
// {team} = اسم الفريق، {points} = النقاط
// ============================================================

const CORRECT = [
  "يا سلاااام! فريق {team} ما بيرحم 🔥",
  "ولا غلطة! +{points} لجيب {team} 💰",
  "عباقرة والله! 🧠✨",
  "هيك الشغل ولا بلاش 👏👏",
  "مين علّمكم هيك؟ إجابة ولا أروع 😎",
  "صح الصح! {team} على نار 🔥🔥",
  "بطل يا بطل! النقاط طارت لـ {team} 🚀",
  "واضح إنكم حافظين الدرس 📚✅",
  "ضربة معلم! 🎯",
  "إجابة بتستاهل تصفيقة كبيرة 👏🎉",
  "حيرة؟ ولا ذرة حيرة عندكم 😏",
  "برافو! المعلومة وصلت بالضبط 💯",
  "تمام التمام يا {team} 🌟",
  "هاي إجابة ناس فاهمة 🤓",
  "النقاط بأمان مع {team} 🏦",
  "ولعت! {team} ما بيوقفها حدا ⚡",
  "إجابة ذهبية تستاهل {points} نقطة 🥇",
  "ما شاء الله عليكم! 🤩",
  "صاروخ! 🚀 الجواب قبل ما نخلص السؤال",
  "بسيطة عليكم هاي 😌✨",
];

const HARD_CORRECT = [
  "يا جماعة هذا سؤال {points}! كيف عرفتوه؟! 🤯",
  "مستوى محترفين رسميًا 🏆🧠",
  "هاي المعلومة ما بيعرفها إلا القليل… وأنتم منهم 👑",
  "أسطوري! سؤال عميق وإجابة أعمق 🌊✨",
  "احترامي الكامل يا {team} 🙇‍♂️🔥",
  "خبراء! لازم نصعّب الأسئلة عليكم 😅",
];

const STEAL = [
  "سرقة نظيفة! 🕵️‍♂️💰 النقاط راحت لـ {team}",
  "خطفوها من تحت أنوفكم 😂🥷",
  "كنتوا قريبين… بس {team} أسرع 🏃‍♂️💨",
  "ضربة مرتدة! {team} يسرق {points} نقطة 🎯",
  "الفرصة ما بتنعاد… و{team} استغلها 😎",
  "سرقة القرن! 🦹‍♂️🔥",
];

const WRONG = [
  "أوووه قريبة… بس لا 😬",
  "يا خسارة! 💔",
  "مش هاي… فكّروا مرة ثانية 🤔",
  "الحيرة ضربت! 😵‍💫",
  "لا لا لا 🙈",
  "مش مشكلة، الجاي أحلى 💪",
];

const TIMEUP = ["خلص الوقت! ⏰", "الوقت ما بيستنى حدا ⌛", "تِك تِك… بوم! ⏰💥"];

const STREAK = [
  "سلسلة نارية! {team} عندهم {count} إجابات ورا بعض 🔥🔥🔥",
  "ما حدا قادر يوقفهم! Streak ×{count} ⚡",
  "على الموجة! {count} صح متتالية 🌊🏄‍♂️",
];

const REVEAL = ["الجواب كان… 👀", "ولا فريق عرفها! 🤷‍♂️", "هاي كانت صعبة على الكل 😅"];

const pick = (list: string[], random: () => number) => list[Math.floor(random() * list.length)] ?? list[0];

const fill = (t: string, vars: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

export function commentFor(
  kind: "correct" | "steal" | "wrong" | "timeup" | "streak" | "reveal",
  vars: { team?: string; points?: number; count?: number },
  random: () => number,
): string {
  const v = { team: vars.team ?? "", points: vars.points ?? 0, count: vars.count ?? 0 };
  switch (kind) {
    case "correct":
      return fill(pick((vars.points ?? 0) >= 500 && random() < 0.6 ? HARD_CORRECT : CORRECT, random), v);
    case "steal":
      return fill(pick(STEAL, random), v);
    case "wrong":
      return fill(pick(WRONG, random), v);
    case "timeup":
      return fill(pick(TIMEUP, random), v);
    case "streak":
      return fill(pick(STREAK, random), v);
    case "reveal":
      return fill(pick(REVEAL, random), v);
  }
}

export const WINNER_LINES = [
  "الأبطال الحقيقيون! 🏆",
  "فوز مستحق بجدارة 👑",
  "ليلة لا تُنسى! 🎉",
  "حيرة انحلّت… والفائز معروف 🥇",
];
