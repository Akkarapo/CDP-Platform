-- workspace_invitations.email is uniquely constrained, so a plain INSERT
-- permanently blocks re-inviting anyone whose old invitation row is still
-- around (e.g. after their membership was removed). Upsert by email
-- instead, resetting the row to a fresh pending invite. Since ON CONFLICT
-- DO UPDATE doesn't fire the table's AFTER INSERT accept-trigger, also
-- call the accept logic directly for any existing auth.users match so a
-- re-invited existing account is still auto-accepted immediately rather
-- than only on their next login.
create or replace function public.invite_workspace_member(p_email text, p_display_name text, p_role workspace_role)
returns workspace_invitations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(p_email));
  normalized_name text := nullif(btrim(p_display_name), '');
  invitation public.workspace_invitations%rowtype;
  matched_user auth.users%rowtype;
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
    normalized_name,
    p_role,
    caller_id
  )
  on conflict (email) do update
    set display_name = excluded.display_name,
        role = excluded.role,
        invited_by = excluded.invited_by,
        status = 'pending',
        accepted_by = null,
        accepted_at = null,
        created_at = now()
  returning * into invitation;

  select * into matched_user
  from auth.users au
  where lower(au.email) = normalized_email
  order by au.created_at asc
  limit 1;

  if found then
    perform private.accept_workspace_invitation_for_user(
      normalized_email,
      matched_user.id,
      coalesce(normalized_name, matched_user.raw_user_meta_data ->> 'full_name', matched_user.raw_user_meta_data ->> 'name')
    );
    select * into invitation from public.workspace_invitations where id = invitation.id;
  end if;

  return invitation;
end;
$function$;
