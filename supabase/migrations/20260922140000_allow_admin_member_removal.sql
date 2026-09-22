grant delete on table public.workspace_members to authenticated;

drop policy if exists "admins can remove non-admin members" on public.workspace_members;
create policy "admins can remove non-admin members"
on public.workspace_members for delete
to authenticated
using (
  (select private.is_workspace_admin((select auth.uid())))
  and role <> 'admin'
);
