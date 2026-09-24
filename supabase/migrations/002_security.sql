-- =====================================================================
-- حيرة | HAYRA — 002: الصلاحيات (RLS) + Storage + Realtime
-- =====================================================================

-- هل المستخدم الحالي مشرف؟
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

alter table public.categories            enable row level security;
alter table public.subcategories         enable row level security;
alter table public.questions             enable row level security;
alter table public.game_packs            enable row level security;
alter table public.game_pack_categories  enable row level security;
alter table public.access_settings       enable row level security;
alter table public.admins                enable row level security;
alter table public.game_sessions         enable row level security;
alter table public.session_public        enable row level security;
alter table public.session_events        enable row level security;
alter table public.qr_tokens             enable row level security;
alter table public.recent_questions      enable row level security;
alter table public.question_feedback     enable row level security;

-- ---------- الفئات والفئات الفرعية والباقات: قراءة عامة للمفعّل، كتابة للمشرف ----------
create policy "categories_read" on public.categories
  for select to anon, authenticated using (is_active or public.is_admin());
create policy "categories_admin_write" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "subcategories_read" on public.subcategories
  for select to anon, authenticated using (is_active or public.is_admin());
create policy "subcategories_admin_write" on public.subcategories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "packs_read" on public.game_packs
  for select to anon, authenticated using (is_active or public.is_admin());
create policy "packs_admin_write" on public.game_packs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "pack_categories_read" on public.game_pack_categories
  for select to anon, authenticated using (true);
create policy "pack_categories_admin_write" on public.game_pack_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- بنك الأسئلة: للمشرف فقط (السيرفر يستخدم service role لاختيار الأسئلة) ----------
create policy "questions_admin_all" on public.questions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- التقييمات: قراءة/حذف للمشرف (الإضافة عبر السيرفر) ----------
create policy "feedback_admin_read" on public.question_feedback
  for select to authenticated using (public.is_admin());
create policy "feedback_admin_delete" on public.question_feedback
  for delete to authenticated using (public.is_admin());

-- ---------- المشرفون: كل مستخدم يرى سطره فقط ----------
create policy "admins_self" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------- الحالة العامة للجلسة: قراءة فقط للتلفزيون والجمهور ----------
create policy "session_public_read" on public.session_public
  for select to anon, authenticated using (true);

-- game_sessions / session_events / qr_tokens / recent_questions / access_settings:
-- لا توجد Policies ⇒ لا يصل إليها إلا service role من السيرفر.

-- =====================================================================
-- Realtime
-- =====================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_public'
  ) then
    alter publication supabase_realtime add table public.session_public;
  end if;
end $$;

-- =====================================================================
-- Storage: bucket عام للقراءة، الرفع للمشرف فقط
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

create policy "media_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
create policy "media_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin());
create policy "media_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());
