alter table public.workspace_invitations
  add column if not exists display_name text;

alter table public.workspace_members
  add column if not exists display_name text;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  target_segment text not null check (target_segment in ('Premium', 'Regular', 'New', 'Dormant', 'ทุก Segment')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'sent')),
  message text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_created_at_idx
  on public.campaigns (created_at desc);

alter table public.campaigns enable row level security;

grant select, insert, update, delete on table public.workspace_invitations to authenticated;
grant select, update on table public.workspace_members to authenticated;
grant select, insert, update, delete on table public.campaigns to authenticated;

revoke all on table public.workspace_invitations from anon;
revoke all on table public.workspace_members from anon;
revoke all on table public.campaigns from anon;

create or replace function private.has_workspace_role(
  check_user_id uuid,
  allowed_roles public.workspace_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = check_user_id
      and wm.role = any (allowed_roles)
  );
$$;

revoke all on function private.has_workspace_role(uuid, public.workspace_role[]) from public;
grant execute on function private.has_workspace_role(uuid, public.workspace_role[]) to authenticated;

drop policy if exists "authorized members can read campaigns" on public.campaigns;
create policy "authorized members can read campaigns"
on public.campaigns for select
to authenticated
using (
  (select private.has_workspace_role(
    (select auth.uid()),
    array['admin', 'editor', 'viewer']::public.workspace_role[]
  ))
);

drop policy if exists "admins and editors can create campaigns" on public.campaigns;
create policy "admins and editors can create campaigns"
on public.campaigns for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.has_workspace_role(
    (select auth.uid()),
    array['admin', 'editor']::public.workspace_role[]
  ))
);

drop policy if exists "admins and editors can update campaigns" on public.campaigns;
create policy "admins and editors can update campaigns"
on public.campaigns for update
to authenticated
using (
  (select private.has_workspace_role(
    (select auth.uid()),
    array['admin', 'editor']::public.workspace_role[]
  ))
)
with check (
  (select private.has_workspace_role(
    (select auth.uid()),
    array['admin', 'editor']::public.workspace_role[]
  ))
);

drop policy if exists "admins and editors can delete campaigns" on public.campaigns;
create policy "admins and editors can delete campaigns"
on public.campaigns for delete
to authenticated
using (
  (select private.has_workspace_role(
    (select auth.uid()),
    array['admin', 'editor']::public.workspace_role[]
  ))
);

drop policy if exists "admins can update memberships" on public.workspace_members;
create policy "admins can update memberships"
on public.workspace_members for update
to authenticated
using ((select private.is_workspace_admin((select auth.uid()))))
with check ((select private.is_workspace_admin((select auth.uid()))));

create or replace function private.accept_workspace_invitation_for_user(
  invited_email text,
  invited_user_id uuid,
  fallback_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_invitation public.workspace_invitations%rowtype;
begin
  select * into matching_invitation
  from public.workspace_invitations wi
  where lower(wi.email::text) = lower(btrim(invited_email))
    and wi.status in ('pending', 'accepted')
  for update;

  if not found then
    return;
  end if;

  insert into public.workspace_members (
    user_id, email, role, invitation_id, display_name
  ) values (
    invited_user_id,
    lower(btrim(invited_email)),
    matching_invitation.role,
    matching_invitation.id,
    coalesce(matching_invitation.display_name, fallback_name)
  )
  on conflict (user_id) do update
    set role = excluded.role,
        display_name = coalesce(excluded.display_name, public.workspace_members.display_name);

  update public.workspace_invitations
  set status = 'accepted',
      accepted_by = invited_user_id,
      accepted_at = coalesce(accepted_at, now())
  where id = matching_invitation.id;
end;
$$;

revoke all on function private.accept_workspace_invitation_for_user(text, uuid, text) from public;

create or replace function private.accept_invitation_on_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.accept_workspace_invitation_for_user(
    new.email,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

revoke all on function private.accept_invitation_on_auth_user() from public;

drop trigger if exists accept_workspace_invitation_on_auth_user on auth.users;
create trigger accept_workspace_invitation_on_auth_user
after insert or update of email on auth.users
for each row execute function private.accept_invitation_on_auth_user();

create or replace function private.accept_invitation_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_user auth.users%rowtype;
begin
  select * into existing_user
  from auth.users au
  where lower(au.email) = lower(new.email::text)
  order by au.created_at asc
  limit 1;

  if found then
    perform private.accept_workspace_invitation_for_user(
      new.email::text,
      existing_user.id,
      coalesce(new.display_name, existing_user.raw_user_meta_data ->> 'full_name', existing_user.raw_user_meta_data ->> 'name')
    );
  end if;

  return new;
end;
$$;

revoke all on function private.accept_invitation_on_insert() from public;

drop trigger if exists accept_existing_user_on_invitation on public.workspace_invitations;
create trigger accept_existing_user_on_invitation
after insert on public.workspace_invitations
for each row execute function private.accept_invitation_on_insert();

create or replace function private.sync_member_role_from_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    update public.workspace_members
    set role = new.role
    where invitation_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_member_role_from_invitation() from public;

drop trigger if exists sync_member_role_from_invitation on public.workspace_invitations;
create trigger sync_member_role_from_invitation
after update of role on public.workspace_invitations
for each row execute function private.sync_member_role_from_invitation();
