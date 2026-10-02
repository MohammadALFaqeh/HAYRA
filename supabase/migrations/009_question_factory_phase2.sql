-- =====================================================================
-- حيرة | HAYRA — 009: مصنع الأسئلة (المرحلة 2)
--   1) مفتاح ثابت يمنع إدخال نفس المرشّح مرتين
--   2) question_fingerprints: نسخة مطبّعة من public.questions لكشف التكرار
--      (جدول جانبي — لا يغيّر public.questions ولا يضيف عليه Trigger)
--   3) factory_find_duplicates(): بحث pg_trgm دفعة واحدة لعدة مرشحين
-- شغّله بعد 008.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) candidate_key
-- ---------------------------------------------------------------------
alter table public.question_candidates add column if not exists candidate_key text;
alter table public.question_candidates
  add constraint question_candidates_candidate_key_key unique (candidate_key);

create index if not exists idx_candidates_answer_eq on public.question_candidates(normalized_answer);
create index if not exists idx_candidates_reference on public.question_candidates((payload->>'reference'));

-- ---------------------------------------------------------------------
-- 2) بصمات أسئلة الإنتاج (تُملأ من السيرفر بنفس دالة التطبيع في TypeScript)
-- ---------------------------------------------------------------------
create table if not exists public.question_fingerprints (
  question_id               uuid primary key references public.questions(id) on delete cascade,
  type                      text not null,
  normalized_question_text  text not null,
  normalized_answer         text not null,
  media_url                 text,
  reference                 text,
  source_updated_at         timestamptz not null,
  refreshed_at              timestamptz not null default now()
);
create index if not exists idx_fingerprints_answer on public.question_fingerprints(normalized_answer);
create index if not exists idx_fingerprints_reference on public.question_fingerprints(reference);
create index if not exists idx_fingerprints_updated on public.question_fingerprints(source_updated_at);

do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute format(
    'create index if not exists idx_fingerprints_question_trgm on public.question_fingerprints using gin (normalized_question_text %I.gin_trgm_ops)',
    v_schema);
end $$;

alter table public.question_fingerprints enable row level security;
create policy "question_fingerprints_admin_all" on public.question_fingerprints
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.question_fingerprints from anon;

-- ---------------------------------------------------------------------
-- 3) البحث عن التكرار
--   لكل مرشّح: أقرب الأسئلة نصًا (pg_trgm %) + نفس الإجابة المطبّعة + نفس المرجع،
--   من الإنتاج (fingerprints) ومن مرشحين في دفعات أخرى غير مرفوضين.
--   التصنيف النهائي (مكرر/مشبوه) يتم في TypeScript (src/lib/factory/dedupe.ts).
--   security invoker: RLS تنطبق (المشرف فقط يرى البيانات).
-- ---------------------------------------------------------------------
create or replace function public.factory_find_duplicates(
  p_candidate_ids   uuid[],
  p_min_similarity  real default 0.45,
  p_limit           int  default 10
)
returns table (
  candidate_id         uuid,
  match_source         text,
  match_id             uuid,
  match_type           text,
  match_question       text,
  match_answer         text,
  match_media          text,
  match_reference      text,
  question_similarity  real,
  answer_similarity    real
)
language plpgsql
volatile
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform set_config('pg_trgm.similarity_threshold', p_min_similarity::text, true);

  return query
  with c as (
    select qc.id as cid,
           qc.batch_id as cbatch,
           coalesce(qc.normalized_question_text, '') as nq,
           coalesce(qc.normalized_answer, '') as na,
           nullif(qc.payload->>'reference', '') as ref
    from public.question_candidates qc
    where qc.id = any(p_candidate_ids)
  )
  select c.cid, m.src, m.mid, m.mtype, m.mq, m.ma, m.mmedia, m.mref,
         similarity(m.mq, c.nq)::real,
         similarity(m.ma, c.na)::real
  from c
  cross join lateral (
    (select 'question'::text as src, f.question_id as mid, f.type as mtype,
            f.normalized_question_text as mq, f.normalized_answer as ma, f.media_url as mmedia, f.reference as mref
       from public.question_fingerprints f
      where c.nq <> '' and f.normalized_question_text % c.nq
      order by similarity(f.normalized_question_text, c.nq) desc
      limit p_limit)
    union
    (select 'question'::text, f.question_id, f.type, f.normalized_question_text, f.normalized_answer, f.media_url, f.reference
       from public.question_fingerprints f
      where c.na <> '' and f.normalized_answer = c.na
      limit p_limit)
    union
    (select 'question'::text, f.question_id, f.type, f.normalized_question_text, f.normalized_answer, f.media_url, f.reference
       from public.question_fingerprints f
      where c.ref is not null and f.reference = c.ref
      limit p_limit)
    union
    (select 'candidate'::text, o.id, o.payload->>'type', o.normalized_question_text, o.normalized_answer,
            coalesce(o.payload->>'image_url', o.payload->>'audio_url', o.payload->>'video_url'), o.payload->>'reference'
       from public.question_candidates o
      where c.nq <> '' and o.normalized_question_text % c.nq
        and o.id <> c.cid and o.batch_id is distinct from c.cbatch
        and o.status not in ('rejected', 'auto_rejected')
      order by similarity(o.normalized_question_text, c.nq) desc
      limit p_limit)
    union
    (select 'candidate'::text, o.id, o.payload->>'type', o.normalized_question_text, o.normalized_answer,
            coalesce(o.payload->>'image_url', o.payload->>'audio_url', o.payload->>'video_url'), o.payload->>'reference'
       from public.question_candidates o
      where c.na <> '' and o.normalized_answer = c.na
        and o.id <> c.cid and o.batch_id is distinct from c.cbatch
        and o.status not in ('rejected', 'auto_rejected')
      limit p_limit)
    union
    (select 'candidate'::text, o.id, o.payload->>'type', o.normalized_question_text, o.normalized_answer,
            coalesce(o.payload->>'image_url', o.payload->>'audio_url', o.payload->>'video_url'), o.payload->>'reference'
       from public.question_candidates o
      where c.ref is not null and o.payload->>'reference' = c.ref
        and o.id <> c.cid and o.batch_id is distinct from c.cbatch
        and o.status not in ('rejected', 'auto_rejected')
      limit p_limit)
  ) m;
end;
$$;

revoke execute on function public.factory_find_duplicates(uuid[], real, int) from public, anon;
grant  execute on function public.factory_find_duplicates(uuid[], real, int) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- تحقق يدوي بعد التشغيل (pg_trgm يجب أن يرى الحروف العربية كحروف):
--   select show_trgm('عاصمه');                                -- يجب ألا تكون فارغة
--   select similarity('ما عاصمه الاردن', 'ما عاصمه الاردن');   -- 1
-- ---------------------------------------------------------------------
