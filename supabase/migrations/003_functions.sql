-- =====================================================================
-- حيرة | HAYRA — 003: الدوال (RPC)
-- =====================================================================

-- ---------------------------------------------------------------------
-- التحقق من رمز الدخول وكلمة المرور → يرجع رقم النسخة أو NULL
-- (يُستدعى من السيرفر فقط)
-- ---------------------------------------------------------------------
create or replace function public.verify_access(p_code text, p_password text)
returns int
language sql
stable
security definer
set search_path = public, extensions
as $$
  select version
  from public.access_settings
  where id = 1
    and lower(access_code) = lower(trim(p_code))
    and password_hash = extensions.crypt(p_password, password_hash);
$$;

create or replace function public.current_access_version()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select version from public.access_settings where id = 1;
$$;

-- ---------------------------------------------------------------------
-- المشرف: عرض بيانات الدخول (بدون الـ hash)
-- ---------------------------------------------------------------------
create or replace function public.admin_get_access()
returns table (access_code text, version int, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query select a.access_code, a.version, a.updated_at from public.access_settings a where a.id = 1;
end;
$$;

-- ---------------------------------------------------------------------
-- المشرف: تغيير الرمز و/أو كلمة المرور (يُبطل كل الدخولات السابقة)
-- ---------------------------------------------------------------------
create or replace function public.admin_set_access(p_code text, p_password text)
returns int
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_version int;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_code is null or length(trim(p_code)) < 3 then
    raise exception 'access code must be at least 3 characters';
  end if;
  if p_password is not null and length(p_password) > 0 and length(p_password) < 6 then
    raise exception 'password must be at least 6 characters';
  end if;

  update public.access_settings
  set access_code   = trim(p_code),
      password_hash = case
                        when p_password is null or length(p_password) = 0 then password_hash
                        else extensions.crypt(p_password, extensions.gen_salt('bf', 10))
                      end,
      version       = version + 1,
      updated_at    = now(),
      updated_by    = auth.uid()
  where id = 1
  returning version into v_version;

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------
-- إحصائيات توفر الأسئلة (لصفحة اختيار الفئات) — أعداد فقط بدون محتوى
-- ---------------------------------------------------------------------
create or replace function public.question_availability()
returns table (
  category_id uuid,
  subcategory_id uuid,
  difficulty smallint,
  total bigint,
  family_safe bigint,
  verified bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select q.category_id, q.subcategory_id, q.difficulty,
         count(*)                                   as total,
         count(*) filter (where q.family_safe)      as family_safe,
         count(*) filter (where q.verified)         as verified
  from public.questions q
  where q.is_active and not q.is_blacklisted
  group by q.category_id, q.subcategory_id, q.difficulty;
$$;

-- ---------------------------------------------------------------------
-- المشرف: تغطية البنك (يشمل غير المفعّل)
-- ---------------------------------------------------------------------
create or replace function public.admin_coverage()
returns table (
  category_id uuid,
  difficulty smallint,
  active bigint,
  inactive bigint,
  unverified bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select q.category_id, q.difficulty,
         count(*) filter (where q.is_active and not q.is_blacklisted),
         count(*) filter (where not q.is_active or q.is_blacklisted),
         count(*) filter (where not q.verified)
  from public.questions q
  group by q.category_id, q.difficulty;
end;
$$;

-- ---------------------------------------------------------------------
-- تسجيل استخدام الأسئلة (للتقليل من التكرار خلال 24 ساعة)
-- ---------------------------------------------------------------------
create or replace function public.mark_questions_used(p_ids uuid[])
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.recent_questions (question_id, used_at)
  select unnest(p_ids), now()
  on conflict (question_id) do update set used_at = excluded.used_at;

  update public.questions
  set times_used = times_used + 1, last_used_at = now()
  where id = any(p_ids);
$$;

-- ---------------------------------------------------------------------
-- تنظيف الجلسات المهجورة والبيانات المؤقتة
-- ---------------------------------------------------------------------
create or replace function public.cleanup_expired()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.game_sessions where expires_at < now();
  delete from public.qr_tokens where expires_at < now();
  delete from public.recent_questions where used_at < now() - interval '24 hours';
$$;

-- ---------------------------------------------------------------------
-- الصلاحيات على الدوال
-- ---------------------------------------------------------------------
revoke execute on function public.verify_access(text, text)        from public, anon, authenticated;
revoke execute on function public.current_access_version()         from public, anon, authenticated;
revoke execute on function public.mark_questions_used(uuid[])      from public, anon, authenticated;
revoke execute on function public.cleanup_expired()                from public, anon, authenticated;
grant  execute on function public.verify_access(text, text)        to service_role;
grant  execute on function public.current_access_version()         to service_role;
grant  execute on function public.mark_questions_used(uuid[])      to service_role;
grant  execute on function public.cleanup_expired()                to service_role;

revoke execute on function public.admin_get_access()               from public, anon;
revoke execute on function public.admin_set_access(text, text)     from public, anon;
revoke execute on function public.admin_coverage()                 from public, anon;
grant  execute on function public.admin_get_access()               to authenticated;
grant  execute on function public.admin_set_access(text, text)     to authenticated;
grant  execute on function public.admin_coverage()                 to authenticated;

grant  execute on function public.question_availability()          to anon, authenticated;

-- ---------------------------------------------------------------------
-- (اختياري) حذف تلقائي كل ساعة عبر pg_cron
-- فعّل pg_cron من Database → Extensions ثم شغّل:
--   select cron.schedule('hayra-cleanup', '0 * * * *', $$select public.cleanup_expired()$$);
-- بدونها: السيرفر ينظّف تلقائيًا عند إنشاء كل لعبة جديدة.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- بيانات الدخول الافتراضية — غيّرها فورًا من لوحة الإدارة
--   Access Code: HAYRA
--   Password:    hayra2026
-- ---------------------------------------------------------------------
insert into public.access_settings (id, access_code, password_hash)
values (1, 'HAYRA', extensions.crypt('hayra2026', extensions.gen_salt('bf', 10)))
on conflict (id) do nothing;
