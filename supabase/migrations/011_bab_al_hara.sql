-- =====================================================================
-- حيرة | HAYRA — 011: تصنيف فرعي «باب الحارة» تحت الدراما
--   + إضافته لباقة «دراما عربية». آمن للتشغيل أكثر من مرة.
-- =====================================================================

insert into public.subcategories (category_id, slug, name, icon, sort_order)
select c.id, 'bab-al-hara', 'باب الحارة', '🚪', 10
from public.categories c
where c.slug = 'drama'
on conflict (category_id, slug) do nothing;

insert into public.game_pack_categories (pack_id, category_id, subcategory_id, sort_order)
select p.id, c.id, sc.id, 7
from public.game_packs p
join public.categories c on c.slug = 'drama'
join public.subcategories sc on sc.category_id = c.id and sc.slug = 'bab-al-hara'
where p.slug = 'arab-drama'
  and not exists (
    select 1 from public.game_pack_categories x
    where x.pack_id = p.id and x.subcategory_id = sc.id
  );
