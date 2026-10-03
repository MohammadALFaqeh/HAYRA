-- =====================================================================
-- حيرة | HAYRA — 012: فئة «عالم الحيوان» + «فقرة التلميحات» + فئات فرعية
--   جديدة للتاريخ والجغرافيا + باقتان جديدتان. بيانات فقط (بدون تغيير
--   للجداول) وآمن للتشغيل أكثر من مرة.
--
--   فقرة التلميحات لا تحتاج نوع سؤال جديد: هي أسئلة who_am_i عليها
--   extra.hint_round = true وثلاثة تلميحات بالضبط (500 ← 300 ← 150).
-- =====================================================================

insert into public.categories (slug, name, icon, color, is_interactive, description, sort_order) values
  ('animals', 'عالم الحيوان', '🦁', 'leaf', false, 'الثدييات والطيور والحياة البحرية والزواحف والحشرات وعجائب الحيوان', 12),
  ('hints', 'تلميحات', '🔍', 'gold', false, 'ثلاثة تلميحات من الأصعب للأسهل: 500 ← 300 ← 150 نقطة', 13)
on conflict (slug) do nothing;

insert into public.subcategories (category_id, slug, name, icon, sort_order)
select c.id, v.slug, v.name, v.icon, v.sort_order
from (values
  ('animals', 'mammals', 'ثدييات', '🐘', 1),
  ('animals', 'birds', 'طيور', '🦅', 2),
  ('animals', 'sea-life', 'حياة بحرية', '🐙', 3),
  ('animals', 'reptiles', 'زواحف وبرمائيات', '🐊', 4),
  ('animals', 'insects', 'حشرات ومفصليات', '🐝', 5),
  ('animals', 'animal-basics', 'صغار وأصوات ومساكن', '🐣', 6),
  ('animals', 'animal-wonders', 'عجائب الحيوان', '🧬', 7),
  ('hints', 'hints-animals', 'حيوانات', '🐾', 1),
  ('hints', 'hints-places', 'دول ومدن ومعالم', '🗺️', 2),
  ('hints', 'hints-people', 'شخصيات', '👤', 3),
  ('hints', 'hints-mixed', 'منوعات', '🎲', 4),
  ('history', 'world-wars', 'الحربان العالميتان', '🪖', 10),
  ('history', 'explorations', 'الاستكشافات والرحلات', '🧭', 11),
  ('history', 'world-civilizations', 'حضارات العالم', '🗿', 12),
  ('geography', 'lakes', 'بحيرات وشلالات', '💧', 10),
  ('geography', 'deserts', 'صحاري', '🏜️', 11),
  ('geography', 'islands', 'جزر وأشباه جزر', '🏝️', 12),
  ('geography', 'climate', 'خطوط ومناخ', '🧭', 13)
) as v(cat, slug, name, icon, sort_order)
join public.categories c on c.slug = v.cat
on conflict (category_id, slug) do nothing;

insert into public.game_packs (slug, name, emoji, description, level, category_count, question_types, family_mode, is_seasonal, season_label, sort_order) values
  ('animal-world', 'عالم الحيوان', '🦁', 'ثدييات وطيور وبحار وزواحف وحشرات — مع فقرة تلميحات الحيوانات', 'family', 6, '{}', true, false, null, 9),
  ('hints-night', 'ليلة التلميحات', '🔍', 'كل الأسئلة بتلميحات: اعرفها من الأول بـ 500 أو انتظر وخذ أقل', 'medium', 4, '{}', true, false, null, 10)
on conflict (slug) do nothing;

insert into public.game_pack_categories (pack_id, category_id, subcategory_id, sort_order)
select p.id, c.id, sc.id, v.ord
from (values
  ('animal-world', 'animals', 'mammals', 1),
  ('animal-world', 'animals', 'birds', 2),
  ('animal-world', 'animals', 'sea-life', 3),
  ('animal-world', 'animals', 'reptiles', 4),
  ('animal-world', 'animals', 'insects', 5),
  ('animal-world', 'hints', 'hints-animals', 6),
  ('hints-night', 'hints', 'hints-animals', 1),
  ('hints-night', 'hints', 'hints-places', 2),
  ('hints-night', 'hints', 'hints-people', 3),
  ('hints-night', 'hints', 'hints-mixed', 4)
) as v(pack, cat, sub, ord)
join public.game_packs p on p.slug = v.pack
join public.categories c on c.slug = v.cat
left join public.subcategories sc on sc.category_id = c.id and sc.slug = v.sub
where not exists (
  select 1 from public.game_pack_categories x
  where x.pack_id = p.id and x.category_id = c.id and x.subcategory_id is not distinct from sc.id
);
