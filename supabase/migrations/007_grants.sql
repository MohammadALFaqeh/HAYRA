-- =====================================================================
-- حيرة — 007: صلاحيات الجداول لأدوار الـ Data API
-- مشاريع Supabase الجديدة لا تمنح anon/authenticated/service_role
-- صلاحيات تلقائية على جداول public، فتفشل كل القراءات بـ
-- "permission denied". الحماية الفعلية تبقى على RLS (مفعّل على كل الجداول).
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- للجداول التي تُنشأ لاحقًا
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
