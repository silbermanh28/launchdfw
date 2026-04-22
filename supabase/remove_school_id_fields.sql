alter table public.students
  drop constraint if exists students_verification_status_check;

alter table public.students
  drop column if exists school_id_url,
  drop column if exists verification_status;
