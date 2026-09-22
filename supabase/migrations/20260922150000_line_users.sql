create table if not exists public.line_users (
  line_user_id text primary key,
  display_name text,
  picture_url text,
  status_message text,
  last_message_text text,
  last_message_at timestamptz,
  followed boolean not null default true,
  unfollowed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.line_users enable row level security;

-- Written only by the webhook/sync serverless functions using the
-- service_role key (bypasses RLS). Browser clients get read-only access.
grant select on table public.line_users to authenticated;
revoke all on table public.line_users from anon;

drop policy if exists "workspace members can read line users" on public.line_users;
create policy "workspace members can read line users"
on public.line_users for select
to authenticated
using (
  (select private.has_workspace_role(
    (select auth.uid()),
    array['admin', 'editor', 'viewer']::public.workspace_role[]
  ))
);
