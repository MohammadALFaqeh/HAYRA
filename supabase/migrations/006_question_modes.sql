-- حيرة | أنواع أسئلة الترتيب والأسئلة الفردية
-- شغّله بعد migrations السابقة إذا كان المشروع موجودًا مسبقًا.
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check check (type in (
  'text','multiple_choice','reverse_points','individual','image','audio','video','logo','identify_image','who_am_i',
  'qr_acting','qr_drawing','qr_describe','qr_secret','qr_who_am_i','qr_sound','qr_movement'
));