import type { GameSettings, Level, MysteryKind, PowerupId, QuestionType } from "./types";

export const POINT_ROWS = [100, 200, 300, 400, 500, 600] as const;
/** قيم خانات اللوحة — كل قيمة مرتين (سؤال لكل فريق)، وكل قيمة تقابل مستوى من المستويات الثلاثة */
export const BOARD_POINTS = [100, 100, 300, 300, 500, 500] as const;

/**
 * المستويات الثلاثة في اللعب والإدارة. الصعوبة المخزّنة تبقى 1..6 لكن كل درجتين مستوى واحد:
 * 1-2 سهل (100)، 3-4 متوسط (300)، 5-6 صعب (500).
 */
export const TIERS = [
  { id: 1, name: "سهل", points: 100, difficulties: [1, 2] },
  { id: 2, name: "متوسط", points: 300, difficulties: [3, 4] },
  { id: 3, name: "صعب", points: 500, difficulties: [5, 6] },
] as const;
export const tierOf = (difficulty: number) => Math.min(3, Math.max(1, Math.ceil(difficulty / 2)));
export const tierPoints = (difficulty: number) => TIERS[tierOf(difficulty) - 1].points;

/**
 * فقرة «التلميحات»: سؤال «من أنا؟» بثلاثة تلميحات من الأصعب للأسهل،
 * وقيمته تنزل مع كل تلميح جديد (التلميح الأول 500، الثاني 300، الثالث 150).
 * يُعلَّم السؤال بـ extra.hint_round = true ولا يحتاج نوعًا جديدًا في قاعدة البيانات.
 */
export const HINT_POINTS = [500, 300, 150] as const;
export const isHintRound = (q: { type: QuestionType; extra?: { hint_round?: boolean } | null; clues?: string[] | null } | null | undefined) =>
  !!q && q.type === "who_am_i" && q.extra?.hint_round === true && (q.clues?.length ?? 0) >= HINT_POINTS.length;
/** قيمة السؤال بعد ظهور عدد معيّن من التلميحات (1..3) */
export const hintPointsAt = (shown: number) => HINT_POINTS[Math.min(HINT_POINTS.length, Math.max(1, shown)) - 1];

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "سهل جدًا",
  2: "سهل",
  3: "متوسط",
  4: "متوسط صعب",
  5: "صعب",
  6: "عميق جدًا",
};

export const LEVELS: { id: Level; name: string; hint: string; depth: number }[] = [
  { id: "family", name: "عائلي", hint: "أسئلة معروفة وممتعة للجميع", depth: 1 },
  { id: "medium", name: "متوسط", hint: "توازن بين السهل والعميق", depth: 2 },
  { id: "pro", name: "محترفين", hint: "أسئلة تحتاج معرفة حقيقية", depth: 3 },
];

export const DEPTH_LABELS: Record<number, string> = { 1: "عائلي", 2: "متوسط", 3: "محترفين" };

export const POWERUPS: Record<PowerupId, { name: string; icon: string; desc: string }> = {
  double: { name: "مضاعفة النقاط", icon: "✖️2", desc: "قيمة السؤال تتضاعف لهذا الفريق" },
  extra_time: { name: "وقت إضافي", icon: "⏱️", desc: "+15 ثانية للمؤقت" },
  no_steal: { name: "بدون سرقة", icon: "🛡️", desc: "إذا لم نعرف، لا يستطيع الخصم سرقة السؤال" },
  fifty_fifty: { name: "50/50", icon: "✂️", desc: "حذف إجابتين خاطئتين (أسئلة الاختيارات)" },
};
export const POWERUP_IDS = Object.keys(POWERUPS) as PowerupId[];

export const MYSTERY: Record<MysteryKind, { name: string; icon: string; desc: string }> = {
  bonus: { name: "هدية!", icon: "🎁", desc: "نقاط مجانية فورًا + السؤال كالعادة" },
  double: { name: "دبل!", icon: "💥", desc: "قيمة السؤال مضاعفة" },
  golden: { name: "السؤال الذهبي", icon: "👑", desc: "ثلاثة أضعاف النقاط — بدون سرقة" },
  challenge: { name: "تحدٍّ مفاجئ", icon: "🎭", desc: "السؤال تحوّل إلى تحدٍّ تفاعلي" },
};

export const QUESTION_TYPES: Record<QuestionType, { name: string; qr: boolean }> = {
  text: { name: "نصي", qr: false },
  multiple_choice: { name: "اختيار من متعدد", qr: false },
  reverse_points: { name: "نقاط عكسية — ترتيب", qr: false },
  individual: { name: "سؤال فردي", qr: false },
  image: { name: "صورة", qr: false },
  audio: { name: "صوت", qr: false },
  video: { name: "فيديو", qr: false },
  logo: { name: "خمن الشعار", qr: false },
  identify_image: { name: "خمن الصورة", qr: false },
  who_am_i: { name: "من أنا؟ (تلميحات)", qr: false },
  qr_acting: { name: "QR — مثّلها", qr: true },
  qr_drawing: { name: "QR — ارسم وخمّن", qr: true },
  qr_describe: { name: "QR — وصف بدون الكلمة", qr: true },
  qr_secret: { name: "QR — كلمة سرية", qr: true },
  qr_who_am_i: { name: "QR — مين أنا؟", qr: true },
  qr_sound: { name: "QR — صوت فقط", qr: true },
  qr_movement: { name: "QR — تحدي حركة", qr: true },
};
export const QUESTION_TYPE_IDS = Object.keys(QUESTION_TYPES) as QuestionType[];

/**
 * فقرات التحديات التفاعلية (QR). كل نوع QR في قاعدة البيانات له «فقرة» أو أكثر تُحدَّد بـ extra.mode،
 * فنضيف فقرات جديدة بدون تعديل قيود قاعدة البيانات. لكل فقرة: من يلعب، القواعد، ومتى يحتسب المضيف النقطة.
 */
export type QrMode =
  | "act" | "act_title" | "face"
  | "draw" | "draw_blind" | "draw_line"
  | "taboo" | "secret"
  | "sound" | "hum"
  | "yes_no"
  | "physical" | "speed" | "tongue";

export interface QrModeInfo {
  type: QuestionType;
  name: string;
  icon: string;
  /** يظهر على الشاشة الكبيرة: من يمسح الرمز وماذا يفعل الباقون */
  who: string;
  /** قواعد اللاعب (تظهر على جواله وعلى الشاشة) */
  rules: string[];
  /** متى يحتسب المضيف الإجابة صحيحة */
  judge: string;
}

export const QR_MODES: Record<QrMode, QrModeInfo> = {
  act: {
    type: "qr_acting", name: "مثّلها", icon: "🎭",
    who: "لاعب واحد يمسح الرمز ويمثّل — والباقي يخمّنون",
    rules: ["مثّل الكلمة بجسمك ويديك", "ممنوع الكلام والأصوات والشفايف", "ممنوع تأشر على أشياء في الغرفة"],
    judge: "النقطة إذا قال الفريق الكلمة نفسها (أو قريبة جدًا) قبل انتهاء الوقت",
  },
  act_title: {
    type: "qr_acting", name: "مثّل فيلم أو مسلسل", icon: "🎬",
    who: "لاعب واحد يمسح الرمز ويمثّل العنوان — والباقي يخمّنون",
    rules: ["ابدأ بإشارة: 🎬 فيلم/مسلسل أو 📺 برنامج", "ارفع أصابع بعدد كلمات العنوان، ثم مثّل كلمة كلمة", "ممنوع الكلام والأصوات"],
    judge: "النقطة إذا قال الفريق العنوان كاملًا",
  },
  face: {
    type: "qr_acting", name: "بوجهك بس", icon: "😶",
    who: "لاعب واحد يمسح الرمز — يداه خلف ظهره طوال الوقت",
    rules: ["عبّر بتعابير الوجه فقط", "اليدين خلف الظهر، والجسم ثابت", "ممنوع الكلام والأصوات"],
    judge: "النقطة إذا قال الفريق الكلمة أو معناها",
  },
  draw: {
    type: "qr_drawing", name: "ارسم وخمّن", icon: "🎨",
    who: "رسّام واحد يمسح الرمز ويرسم على ورقة — والباقي يخمّنون",
    rules: ["ارسم الكلمة على ورقة أو لوح", "ممنوع كتابة حروف أو أرقام أو رموز", "ممنوع الكلام — تقدر تأشر على رسمتك فقط"],
    judge: "النقطة إذا قال الفريق الكلمة قبل انتهاء الوقت",
  },
  draw_blind: {
    type: "qr_drawing", name: "ارسم وعيونك مسكّرة", icon: "🙈",
    who: "رسّام واحد يقرأ الكلمة، يغمض عينيه، ويرسم",
    rules: ["اقرأ الكلمة ثم غمّض عينيك حتى النهاية", "ارسم وعيونك مسكّرة — ممنوع تفتحها", "ممنوع الحروف والأرقام والكلام"],
    judge: "النقطة إذا خمّن الفريق الكلمة وعيون الرسام بقيت مسكّرة",
  },
  draw_line: {
    type: "qr_drawing", name: "خط واحد بدون ما ترفع القلم", icon: "〰️",
    who: "رسّام واحد يمسح الرمز ويرسم بخط واحد متصل",
    rules: ["ارسم الشكل كله بخط واحد بدون رفع القلم عن الورقة", "إذا رفعت القلم تبدأ رسمة جديدة من الصفر", "ممنوع الحروف والأرقام والكلام"],
    judge: "النقطة إذا خمّن الفريق الكلمة والقلم ما انرفع",
  },
  taboo: {
    type: "qr_describe", name: "اشرحها بدون الكلمات الممنوعة", icon: "🗣️",
    who: "لاعب واحد يمسح الرمز ويشرح بالكلام — والباقي يخمّنون",
    rules: ["اشرح الكلمة بالكلام كما تحب", "ممنوع تقول الكلمة أو جزءًا منها", "ممنوع الكلمات الممنوعة الظاهرة على جوالك", "ممنوع الترجمة والإشارات"],
    judge: "النقطة إذا قالوا الكلمة — وإذا قال الشارح كلمة ممنوعة تضيع النقطة فورًا",
  },
  secret: {
    type: "qr_secret", name: "كلمة سرية", icon: "🤫",
    who: "لاعب واحد يمسح الرمز ويعطي تلميحات — كلمة وحدة في كل مرة",
    rules: ["قل كلمة واحدة فقط كتلميح، واستنى تخمينهم", "بعدها تقدر تعطي كلمة ثانية… وهكذا", "ممنوع الجمل والإشارات وأجزاء الكلمة"],
    judge: "النقطة إذا خمّنوا الكلمة — وكل ما كانت التلميحات أقل كان الأداء أقوى",
  },
  sound: {
    type: "qr_sound", name: "قلّد الصوت", icon: "🔊",
    who: "لاعب واحد يمسح الرمز ويقلّد الصوت — والباقي يخمّنون مصدره",
    rules: ["قلّد الصوت بفمك فقط", "ممنوع الكلام والكلمات", "ممنوع التمثيل بالجسم — صوت فقط"],
    judge: "النقطة إذا عرف الفريق مصدر الصوت",
  },
  hum: {
    type: "qr_sound", name: "دندنها", icon: "🎵",
    who: "لاعب واحد يمسح الرمز ويدندن اللحن — والباقي يخمّنون",
    rules: ["دندن اللحن بـ «همم» أو «لا لا لا» فقط", "ممنوع تقول أي كلمة من كلمات الأغنية أو اسمها", "ممنوع الإشارات"],
    judge: "النقطة إذا قال الفريق اسم الأغنية أو أول سطر منها",
  },
  yes_no: {
    type: "qr_who_am_i", name: "مين أنا؟ (نعم أو لا)", icon: "🎩",
    who: "لاعب واحد يمسح الرمز ويصير هو الشخصية — والفريق يسأله",
    rules: ["فريقك يسألك أسئلة، وأنت تجاوب «نعم» أو «لا» أو «ممكن» فقط", "ممنوع أي تلميح إضافي", "الفريق يقدر يخمّن الاسم بأي وقت"],
    judge: "النقطة إذا قال الفريق اسم الشخصية قبل انتهاء الوقت",
  },
  physical: {
    type: "qr_movement", name: "تحدي حركة", icon: "🤸",
    who: "لاعب واحد يمسح الرمز وينفّذ التحدي أمام الجميع",
    rules: ["اقرأ التحدي بصوت عالٍ للكل", "نفّذه مباشرة أمام المضيف", "المضيف يعدّ ويراقب"],
    judge: "النقطة إذا أكمل التحدي كما هو مكتوب بالضبط",
  },
  speed: {
    type: "qr_movement", name: "تحدي سرعة", icon: "⚡",
    who: "لاعب واحد يمسح الرمز ويقرأ التحدي بصوت عالٍ — المضيف يعدّ",
    rules: ["اقرأ التحدي بصوت عالٍ، والمضيف يبدأ العدّ", "جاوب لوحدك — ممنوع مساعدة الفريق", "التكرار والإجابات الخاطئة ما بتنحسب"],
    judge: "النقطة إذا وصل للعدد المطلوب قبل انتهاء الثواني المكتوبة",
  },
  tongue: {
    type: "qr_movement", name: "قولها بسرعة", icon: "👅",
    who: "لاعب واحد يمسح الرمز ويقرأ الجملة",
    rules: ["قل الجملة ثلاث مرات متتالية بسرعة", "بدون توقف وبدون غلط ولا تأتأة", "عندك محاولتين فقط"],
    judge: "النقطة إذا قالها ثلاث مرات صحيحة متتالية",
  },
};

const DEFAULT_QR_MODE: Partial<Record<QuestionType, QrMode>> = {
  qr_acting: "act",
  qr_drawing: "draw",
  qr_describe: "taboo",
  qr_secret: "secret",
  qr_sound: "sound",
  qr_who_am_i: "yes_no",
  qr_movement: "physical",
};

/** فقرة تحدي QR لسؤال معيّن (extra.mode إن وُجد وكان يناسب النوع، وإلا الفقرة الافتراضية للنوع) */
export function qrModeOf(q: { type: QuestionType; extra?: { mode?: string } | null } | null | undefined): QrMode | null {
  if (!q || !isQrType(q.type)) return null;
  const m = q.extra?.mode as QrMode | undefined;
  if (m && QR_MODES[m]?.type === q.type) return m;
  return DEFAULT_QR_MODE[q.type] ?? null;
}

export const isQrType = (t: QuestionType) => QUESTION_TYPES[t]?.qr === true;

export const DEFAULT_SETTINGS: GameSettings = {
  level: "medium",
  questionSeconds: 60,
  stealSeconds: 20,
  finalSeconds: 60,
  familyMode: false,
  verifiedOnly: false,
  powerupsEnabled: true,
  enabledPowerups: ["double", "extra_time", "no_steal", "fifty_fifty"],
  streakEnabled: true,
  streakThreshold: 3,
  streakBonus: 100,
  mysteryEnabled: true,
  mysteryCount: 2,
  finalEnabled: true,
};

export const TEAM_NAME_IDEAS = [
  "النمور", "الصقور", "النسور", "الأسود", "الذئاب", "الفرسان", "العباقرة", "المحترفين",
  "النجوم", "الأبطال", "البرق", "الرعد", "الشهب", "الفهود", "القادة", "الحيارى",
];

export const SESSION_TTL_HOURS = 12;
export const QR_TOKEN_TTL_MINUTES = 30;
export const UNDO_HISTORY_LIMIT = 60;
export const RECENT_QUESTIONS_HOURS = 24;
export const EXTRA_TIME_SECONDS = 15;
export const MYSTERY_BONUS_POINTS = 200;
