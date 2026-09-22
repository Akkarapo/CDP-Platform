create or replace function public.invite_workspace_member(
  p_email text,
  p_display_name text,
  p_role public.workspace_role
)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(p_email));
  invitation public.workspace_invitations%rowtype;
begin
  if caller_id is null or not private.is_workspace_admin(caller_id) then
    raise exception 'Only workspace admins can invite members'
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
$$;

revoke all on function public.invite_workspace_member(text, text, public.workspace_role) from public;
revoke all on function public.invite_workspace_member(text, text, public.workspace_role) from anon;
grant execute on function public.invite_workspace_member(text, text, public.workspace_role) to authenticated;
