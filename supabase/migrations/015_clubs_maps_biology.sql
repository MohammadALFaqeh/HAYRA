-- =====================================================================
-- حيرة | HAYRA — 015: فئات فرعية: أحياء (علوم)، ريال مدريد وبرشلونة
--   (رياضة)، خرائط الدول (جغرافيا). بيانات فقط وآمن للتكرار.
--   الأسئلة في supabase/seed/hayra-questions-22..24.json
-- =====================================================================

insert into public.subcategories (category_id, slug, name, icon, sort_order)
select c.id, v.slug, v.name, v.icon, v.sort_order
from (values
  ('science', 'biology', 'أحياء', '🧬', 9),
  ('sports', 'real-madrid', 'ريال مدريد', '⚪', 9),
  ('sports', 'barcelona', 'برشلونة', '🔵', 10),
  ('geography', 'maps', 'خرائط الدول', '🗺️', 9)
) as v(cat, slug, name, icon, sort_order)
join public.categories c on c.slug = v.cat
on conflict (category_id, slug) do nothing;
