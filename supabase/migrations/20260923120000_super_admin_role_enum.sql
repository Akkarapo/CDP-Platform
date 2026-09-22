-- Must run alone: Postgres forbids using a new enum value in the same
-- transaction that adds it.
alter type public.workspace_role add value if not exists 'super_admin';
