-- =====================================================================
-- حيرة | HAYRA — 008: مصنع الأسئلة (طبقة تجهيز قبل بنك الأسئلة)
--   مصادر خارجية → source_facts → question_candidates → candidate_checks
--   → مراجعة بشرية → public.questions
-- لا يعدّل هذا الملف جدول public.questions.
--
-- تنبيه أمني: migration 007 يمنح anon/authenticated صلاحيات افتراضية على
-- كل جدول جديد. لذلك نفعّل RLS على كل الجداول هنا (بدون Policy = لا وصول)،
-- ونضيف Policy للمشرف فقط، ونسحب صلاحيات anon احتياطًا.
-- =====================================================================

-- ---------------------------------------------------------------------
-- pg_trgm للمقارنة التقريبية (كشف التكرار)
-- ---------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- =====================================================================
-- دفعات التوليد
-- =====================================================================
create table if not exists public.generation_batches (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,
  category_slug     text,
  subcategory_slug  text,
  status            text not null
                    check (status in ('pending','running','completed','failed')),
  requested_count   int,
  generated_count   int default 0,
  accepted_count    int default 0,
  rejected_count    int default 0,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_generation_batches_updated before update on public.generation_batches
  for each row execute function public.set_updated_at();

-- =====================================================================
-- الحقائق الخام من المصادر (subject / predicate / object)
-- =====================================================================
create table if not exists public.source_facts (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid references public.generation_batches(id) on delete set null,
  provider          text not null,
  external_id       text not null,
  subject           text not null,
  predicate         text not null,
  object_value      text not null,
  category_slug     text,
  subcategory_slug  text,
  source_url        text,
  source_name       text,
  source_license    text,
  raw_payload       jsonb not null default '{}'::jsonb,
  retrieved_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (provider, external_id, predicate, object_value)
);
create index if not exists idx_source_facts_provider on public.source_facts(provider, external_id);
create index if not exists idx_source_facts_taxonomy on public.source_facts(category_slug, subcategory_slug);

-- =====================================================================
-- الأسئلة المرشّحة (payload بصيغة QuestionDraft)
-- =====================================================================
create table if not exists public.question_candidates (
  id                        uuid primary key default gen_random_uuid(),
  fact_id                   uuid references public.source_facts(id) on delete set null,
  batch_id                  uuid references public.generation_batches(id) on delete set null,
  status                    text not null default 'pending'
                            check (status in ('pending','auto_rejected','needs_review','approved','promoted','rejected')),
  payload                   jsonb not null,
  normalized_question_text  text,
  normalized_answer         text,
  duplicate_score           numeric,
  duplicate_question_id     uuid references public.questions(id) on delete set null,
  rejection_reason          text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists idx_candidates_status on public.question_candidates(status);
create index if not exists idx_candidates_batch on public.question_candidates(batch_id);
create trigger trg_question_candidates_updated before update on public.question_candidates
  for each row execute function public.set_updated_at();

-- فهارس trigram — تُنشأ ديناميكيًا حسب المخطط الذي ثُبّت فيه pg_trgm
-- (قد يكون مفعّلًا مسبقًا في public بدل extensions)
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute format(
    'create index if not exists idx_candidates_question_trgm on public.question_candidates using gin (normalized_question_text %I.gin_trgm_ops)',
    v_schema);
  execute format(
    'create index if not exists idx_candidates_answer_trgm on public.question_candidates using gin (normalized_answer %I.gin_trgm_ops)',
    v_schema);
end $$;

-- =====================================================================
-- نتائج الفحوص الآلية لكل مرشّح
-- =====================================================================
create table if not exists public.candidate_checks (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references public.question_candidates(id) on delete cascade,
  check_name    text not null,
  status        text not null check (status in ('pass','fail','warning')),
  score         numeric,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_candidate_checks_candidate on public.candidate_checks(candidate_id);

-- =====================================================================
-- RLS: للمشرف فقط (نفس نمط questions_admin_all)
-- =====================================================================
alter table public.generation_batches   enable row level security;
alter table public.source_facts         enable row level security;
alter table public.question_candidates  enable row level security;
alter table public.candidate_checks     enable row level security;

create policy "generation_batches_admin_all" on public.generation_batches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "source_facts_admin_all" on public.source_facts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "question_candidates_admin_all" on public.question_candidates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "candidate_checks_admin_all" on public.candidate_checks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- دفاع إضافي: anon لا يحتاج هذه الجداول إطلاقًا (RLS يمنعه أصلًا)
revoke all on public.generation_batches   from anon;
revoke all on public.source_facts         from anon;
revoke all on public.question_candidates  from anon;
revoke all on public.candidate_checks     from anon;
