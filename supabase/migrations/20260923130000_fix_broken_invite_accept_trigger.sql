-- accept_existing_user_before_invite fires BEFORE the invitation row is
-- inserted, then tries to insert a workspace_members row whose
-- invitation_id references that not-yet-existent row — the FK can never
-- be satisfied, so this always fails whenever it isn't a no-op (i.e.
-- whenever the invited email already has an auth.users account, such as
-- re-inviting someone who was previously removed). The working,
-- correctly-ordered AFTER INSERT trigger (accept_existing_user_on_invitation
-- -> private.accept_invitation_on_insert) already covers this exact case
-- via workspace_invitations.status, so this broken duplicate is dropped
-- rather than fixed in place.
drop trigger if exists accept_existing_user_before_invite on public.workspace_invitations;
drop function if exists private.accept_existing_user_after_invite();
