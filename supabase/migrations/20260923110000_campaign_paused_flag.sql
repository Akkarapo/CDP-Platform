-- "paused" replaces the earlier standalone 'paused' status: it's now an
-- orthogonal flag so a campaign can be paused/resumed both before AND
-- after the real LINE send (status alone can't express "sent but halted").
update public.campaigns set status = 'approved' where status = 'paused';

alter table public.campaigns add column if not exists paused boolean not null default false;

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('pending', 'rejected', 'approved', 'cancelled', 'sent'));
