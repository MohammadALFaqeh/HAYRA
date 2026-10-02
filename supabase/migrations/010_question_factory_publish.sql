-- =====================================================================
-- حيرة | HAYRA — 010: مصنع الأسئلة (النشر التلقائي)
--   ربط المرشّح بالسؤال الذي نُشر منه في public.questions.
--   لا يغيّر public.questions. شغّله بعد 009.
-- =====================================================================

alter table public.question_candidates
  add column if not exists promoted_question_id uuid references public.questions(id) on delete set null;

create index if not exists idx_candidates_promoted on public.question_candidates(promoted_question_id);
