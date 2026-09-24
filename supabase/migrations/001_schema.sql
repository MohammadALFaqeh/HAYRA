-- =====================================================================
-- حيرة | HAYRA — 001: الجداول الأساسية
-- شغّل الملفات بالترتيب داخل Supabase → SQL Editor
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- دالة عامة لتحديث updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- الفئات الرئيسية
-- =====================================================================
create table if not exists public.categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name            text not null,
  description     text,
  icon            text not null default '❓',
  color           text not null default 'volt'
                  check (color in ('gold','volt','violet','leaf','wine','ember')),
  image_url       text,
  is_interactive  boolean not null default false,
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- =====================================================================
-- الفئات الفرعية
-- =====================================================================
create table if not exists public.subcategories (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9-]+$'),
  name         text not null,
  description  text,
  icon         text,
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, slug)
);
create index if not exists idx_subcategories_category on public.subcategories(category_id);
create trigger trg_subcategories_updated before update on public.subcategories
  for each row execute function public.set_updated_at();

-- =====================================================================
-- بنك الأسئلة (دائم)
--   difficulty: 1..6  ←→  points = difficulty * 100 (عمود محسوب تلقائيًا)
--   depth_level: 1 = عائلي، 2 = متوسط، 3 = محترفين
-- =====================================================================
create table if not exists public.questions (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,
  category_id     uuid not null references public.categories(id) on delete restrict,
  subcategory_id  uuid references public.subcategories(id) on delete set null,
  type            text not null default 'text' check (type in (
                    'text','multiple_choice','reverse_points','individual','image','audio','video','logo','identify_image','who_am_i',
                    'qr_acting','qr_drawing','qr_describe','qr_secret','qr_who_am_i','qr_sound','qr_movement'
                  )),
  question_text   text not null,
  answer          text not null,
  choices         jsonb check (choices is null or jsonb_typeof(choices) = 'array'),
  clues           jsonb check (clues is null or jsonb_typeof(clues) = 'array'),
  extra           jsonb not null default '{}'::jsonb,
  difficulty      smallint not null check (difficulty between 1 and 6),
  points          int generated always as (difficulty * 100) stored,
  depth_level     smallint not null default 2 check (depth_level between 1 and 3),
  image_url       text,
  audio_url       text,
  video_url       text,
  explanation     text,
  source          text,
  reference       text,
  verified        boolean not null default false,
  family_safe     boolean not null default true,
  tags            text[] not null default '{}',
  is_active       boolean not null default true,
  is_blacklisted  boolean not null default false,
  language        text not null default 'ar',
  import_source   text,
  import_batch    text,
  external_id     text,
  times_used      int not null default 0,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (import_source, external_id)
);
create index if not exists idx_questions_pick
  on public.questions(category_id, difficulty)
  where is_active and not is_blacklisted;
create index if not exists idx_questions_sub on public.questions(subcategory_id);
create index if not exists idx_questions_tags on public.questions using gin(tags);
create index if not exists idx_questions_batch on public.questions(import_batch);
create trigger trg_questions_updated before update on public.questions
  for each row execute function public.set_updated_at();

-- =====================================================================
-- الباقات الجاهزة + الموسمية
-- =====================================================================
create table if not exists public.game_packs (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name            text not null,
  description     text,
  emoji           text not null default '🎯',
  cover_url       text,
  level           text not null default 'medium' check (level in ('family','medium','pro')),
  category_count  int not null default 6 check (category_count between 3 and 8),
  question_types  text[] not null default '{}',
  family_mode     boolean not null default false,
  is_seasonal     boolean not null default false,
  season_label    text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_packs_updated before update on public.game_packs
  for each row execute function public.set_updated_at();

create table if not exists public.game_pack_categories (
  id              uuid primary key default gen_random_uuid(),
  pack_id         uuid not null references public.game_packs(id) on delete cascade,
  category_id     uuid not null references public.categories(id) on delete cascade,
  subcategory_id  uuid references public.subcategories(id) on delete cascade,
  sort_order      int not null default 0
);
create index if not exists idx_pack_categories_pack on public.game_pack_categories(pack_id);

-- =====================================================================
-- بيانات الدخول المشتركة (Access Code + Password Hash)
-- =====================================================================
create table if not exists public.access_settings (
  id             smallint primary key default 1 check (id = 1),
  access_code    text not null,
  password_hash  text not null,
  version        int not null default 1,
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

-- =====================================================================
-- المشرفون (مرتبطون بـ Supabase Auth)
-- =====================================================================
create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- جلسات اللعب (مؤقتة) — تُحذف عند انتهاء اللعبة أو بعد 12 ساعة خمول
--   state: الحالة الكاملة (تحتوي الإجابات) — لا يقرأها إلا السيرفر
--   session_public.state: النسخة المعروضة على التلفزيون والجمهور — بدون إجابات
-- =====================================================================
create table if not exists public.game_sessions (
  id             uuid primary key default gen_random_uuid(),
  host_key_hash  text not null,
  rev            int not null default 0,
  state          jsonb not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '12 hours')
);
create index if not exists idx_sessions_expires on public.game_sessions(expires_at);

create table if not exists public.session_public (
  session_id  uuid primary key references public.game_sessions(id) on delete cascade,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.session_public replica identity full;

-- سجل الأحداث داخل الجلسة (للتراجع Undo) — يُحذف مع الجلسة
create table if not exists public.session_events (
  id           bigserial primary key,
  session_id   uuid not null references public.game_sessions(id) on delete cascade,
  action_type  text not null,
  payload      jsonb not null default '{}'::jsonb,
  prev_state   jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_events_session on public.session_events(session_id, id desc);

-- رموز QR المؤقتة (لا تحتوي الإجابة)
create table if not exists public.qr_tokens (
  token        text primary key,
  session_id   uuid not null references public.game_sessions(id) on delete cascade,
  cell_key     text not null,
  question_id  uuid not null,
  claimed_by   text,
  claimed_at   timestamptz,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_qr_session on public.qr_tokens(session_id);

-- آخر الأسئلة المستخدمة (مؤقت 24 ساعة) لتقليل التكرار بين الألعاب المتتالية
create table if not exists public.recent_questions (
  question_id  uuid primary key references public.questions(id) on delete cascade,
  used_at      timestamptz not null default now()
);

-- تقييم الأسئلة من المضيف
create table if not exists public.question_feedback (
  id           bigserial primary key,
  question_id  uuid not null references public.questions(id) on delete cascade,
  rating       text not null check (rating in ('excellent','too_easy','too_hard','unclear','needs_review')),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_feedback_question on public.question_feedback(question_id);
