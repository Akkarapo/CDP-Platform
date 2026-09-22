-- super_admin counts as "admin" everywhere private.is_workspace_admin() or
-- private.has_workspace_role(..., array[...,'admin',...]) is checked, so
-- every existing admin-gated policy/RPC extends to super_admin for free.
create or replace function private.is_workspace_admin(check_user_id uuid)
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
      and wm.role in ('admin', 'super_admin')
  );
$$;

create or replace function private.is_super_admin(check_user_id uuid)
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
      and wm.role = 'super_admin'
  );
$$;

revoke all on function private.is_super_admin(uuid) from public;
grant execute on function private.is_super_admin(uuid) to authenticated;

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
      and (
        wm.role = any (allowed_roles)
        or (wm.role = 'super_admin' and 'admin' = any (allowed_roles))
      )
  );
$$;

-- Hard invariant: at most one super_admin can ever exist, enforced by the
-- database regardless of what application code does.
create unique index if not exists workspace_members_single_super_admin
on public.workspace_members ((true))
where role = 'super_admin';

-- Regular admins manage editor/viewer members only; admin-tier rows
-- (admin, super_admin) can only be touched by the super_admin — and even
-- the super_admin can't hand out 'super_admin' through this generic path,
-- that only happens atomically via transfer_super_admin() below.
drop policy if exists "admins can update memberships" on public.workspace_members;

drop policy if exists "admins can update editor and viewer memberships" on public.workspace_members;
create policy "admins can update editor and viewer memberships"
on public.workspace_members for update
to authenticated
using (
  (select private.is_workspace_admin((select auth.uid())))
  and role in ('editor', 'viewer')
)
with check (
  (select private.is_workspace_admin((select auth.uid())))
  and role in ('editor', 'viewer')
);

drop policy if exists "super admin can update admin memberships" on public.workspace_members;
create policy "super admin can update admin memberships"
on public.workspace_members for update
to authenticated
using (
  (select private.is_super_admin((select auth.uid())))
  and role = 'admin'
)
with check (
  (select private.is_super_admin((select auth.uid())))
  and role in ('admin', 'editor', 'viewer')
);

-- Deletion: regular admins remove editor/viewer members; only the super
-- admin can remove an admin. Nobody can delete the super_admin row itself
-- through this policy (no role match covers it).
drop policy if exists "admins can remove non-admin members" on public.workspace_members;

drop policy if exists "admins can remove editor and viewer members" on public.workspace_members;
create policy "admins can remove editor and viewer members"
on public.workspace_members for delete
to authenticated
using (
  (select private.is_workspace_admin((select auth.uid())))
  and role in ('editor', 'viewer')
);

drop policy if exists "super admin can remove admin members" on public.workspace_members;
create policy "super admin can remove admin members"
on public.workspace_members for delete
to authenticated
using (
  (select private.is_super_admin((select auth.uid())))
  and role = 'admin'
);

-- super_admin is never an invitable role — it only exists via transfer
-- among existing members (see transfer_super_admin below).
create or replace function public.invite_workspace_member(p_email text, p_display_name text, p_role workspace_role)
returns workspace_invitations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(p_email));
  invitation public.workspace_invitations%rowtype;
begin
  if caller_id is null or not private.is_workspace_admin(caller_id) then
    raise exception 'Only workspace admins can invite members'
      using errcode = '42501';
  end if;

  if p_role = 'super_admin' then
    raise exception 'super_admin cannot be assigned via invite'
      using errcode = '42501';
  end if;

  if normalized_email = '' or position('@' in normalized_email) <= 1 then
    raise exception 'Invalid email address'
      using errcode = '22023';
  end if;

  insert into public.workspace_invitations (
    email,
    display_name,
    role,
    invited_by
  ) values (
    normalized_email,
    nullif(btrim(p_display_name), ''),
    p_role,
    caller_id
  )
  returning * into invitation;

  return invitation;
end;
$function$;

-- Atomic handoff: the current super_admin hands the role to another
-- existing member and is demoted to 'admin' in the same transaction, so
-- the single-super_admin invariant is never violated even momentarily.
create or replace function public.transfer_super_admin(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null or not private.is_super_admin(caller_id) then
    raise exception 'Only the current super admin can transfer this role'
      using errcode = '42501';
  end if;

  if p_target_user_id = caller_id then
    raise exception 'Already super admin'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.workspace_members where user_id = p_target_user_id) then
    raise exception 'Target user is not a workspace member'
      using errcode = '22023';
  end if;

  update public.workspace_members set role = 'admin' where user_id = caller_id;
  update public.workspace_members set role = 'super_admin' where user_id = p_target_user_id;
end;
$function$;

revoke all on function public.transfer_super_admin(uuid) from public;
grant execute on function public.transfer_super_admin(uuid) to authenticated;
