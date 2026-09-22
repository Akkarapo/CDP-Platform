alter table public.line_users add column if not exists is_admin boolean not null default false;
alter table public.line_users add column if not exists segment text check (segment in ('Premium', 'Regular', 'New', 'Dormant'));

-- Browser clients (workspace admin/editor) may tag a LINE user as bot-admin
-- or assign a manual segment; every other column stays service_role-only.
grant update (is_admin, segment) on table public.line_users to authenticated;

drop policy if exists "admins can tag line users" on public.line_users;
create policy "admins can tag line users"
on public.line_users for update
to authenticated
using (
  (select private.has_workspace_role((select auth.uid()), array['admin', 'editor']::public.workspace_role[]))
)
with check (
  (select private.has_workspace_role((select auth.uid()), array['admin', 'editor']::public.workspace_role[]))
);

create table if not exists public.campaign_clicks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  code text not null unique,
  clicked_at timestamptz not null default now(),
  confirmed_line_user_id text,
  confirmed_at timestamptz
);

create index if not exists campaign_clicks_campaign_id_idx on public.campaign_clicks (campaign_id);

alter table public.campaign_clicks enable row level security;

grant select on table public.campaign_clicks to authenticated;
revoke all on table public.campaign_clicks from anon;

drop policy if exists "workspace members can read campaign clicks" on public.campaign_clicks;
create policy "workspace members can read campaign clicks"
on public.campaign_clicks for select
to authenticated
using (
  (select private.has_workspace_role(
    (select auth.uid()),
    array['admin', 'editor', 'viewer']::public.workspace_role[]
  ))
);
