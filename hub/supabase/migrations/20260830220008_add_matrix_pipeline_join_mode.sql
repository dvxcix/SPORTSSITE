alter table public.matrix_pipeline_steps
  add column if not exists join_mode text;

alter table public.matrix_pipeline_steps
  drop constraint if exists matrix_pipeline_steps_join_mode_check;

alter table public.matrix_pipeline_steps
  add constraint matrix_pipeline_steps_join_mode_check
  check (join_mode is null or join_mode in ('and', 'or'));

comment on column public.matrix_pipeline_steps.join_mode is
  'How an adjacent filter joins the preceding filter. NULL preserves legacy AND behavior.';
