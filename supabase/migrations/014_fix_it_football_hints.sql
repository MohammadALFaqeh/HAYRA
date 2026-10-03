-- =====================================================================
-- حيرة | HAYRA — 014: فئة «صحّح الخطأ» (8 فئات فرعية) + فئة فرعية
--   «لاعبو كرة القدم» ضمن فقرة التلميحات. بيانات فقط وآمن للتكرار.
--   الأسئلة في supabase/seed/hayra-questions-20..21.json
-- =====================================================================

insert into public.categories (slug, name, icon, color, is_interactive, description, sort_order) values
  ('fix-it', 'صحّح الخطأ', '✏️', 'ember', false, 'عبارة فيها خطأ واحد واضح: اكتشفه وصحّحه', 14)
on conflict (slug) do nothing;

insert into public.subcategories (category_id, slug, name, icon, sort_order)
select c.id, v.slug, v.name, v.icon, v.sort_order
from (values
  ('fix-it', 'fix-geography', 'جغرافيا', '🌍', 1),
  ('fix-it', 'fix-sports', 'رياضة', '⚽', 2),
  ('fix-it', 'fix-science', 'علوم وأحياء', '🔬', 3),
  ('fix-it', 'fix-history', 'تاريخ', '🏛️', 4),
  ('fix-it', 'fix-islamic', 'إسلاميات', '🕌', 5),
  ('fix-it', 'fix-arabic', 'لغة عربية', '📜', 6),
  ('fix-it', 'fix-arts', 'فن وأدب ومشاهير', '🎨', 7),
  ('fix-it', 'fix-general', 'منوعات', '💡', 8),
  ('hints', 'hints-football', 'لاعبو كرة القدم', '⚽', 5)
) as v(cat, slug, name, icon, sort_order)
join public.categories c on c.slug = v.cat
on conflict (category_id, slug) do nothing;
