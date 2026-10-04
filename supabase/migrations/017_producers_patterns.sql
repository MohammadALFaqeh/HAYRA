-- =====================================================================
-- حيرة | HAYRA — 017: فئتان فرعيتان: «الأكثر إنتاجًا» (جغرافيا) و«أنماط
--   وأرقام» (ألغاز). بيانات فقط وآمن للتكرار.
--   الأسئلة في supabase/seed/hayra-questions-26..28.json
-- =====================================================================

insert into public.subcategories (category_id, slug, name, icon, sort_order)
select c.id, v.slug, v.name, v.icon, v.sort_order
from (values
  ('geography', 'top-producers', 'الأكثر إنتاجًا', '🏭', 10),
  ('puzzles', 'patterns', 'أنماط وأرقام', '🔢', 4)
) as v(cat, slug, name, icon, sort_order)
join public.categories c on c.slug = v.cat
on conflict (category_id, slug) do nothing;
