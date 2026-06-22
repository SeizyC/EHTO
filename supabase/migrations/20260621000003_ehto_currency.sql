-- Unified currency "EHTO" on top of ticket_balances (kind='ehto').
--
-- spend_ehto: atomic multi-unit debit (decrement by p_amount only when the
-- balance covers it), mirroring consume_ticket but parameterized by amount.
-- Also retires the legacy starter-tickets trigger (profiles.tickets is now
-- deprecated) and backfills a starting EHTO grant for existing users.

create or replace function public.spend_ehto(p_user uuid, p_amount integer)
returns integer
language sql
as $$
  update public.ticket_balances
     set balance = balance - p_amount, updated_at = now()
   where user_id = p_user and kind = 'ehto' and balance >= p_amount
  returning balance;
$$;

-- Legacy starter tickets (profiles.tickets) are deprecated — stop the trigger.
drop trigger if exists profiles_starter_tickets on public.profiles;
drop function if exists public.grant_starter_tickets();

-- Backfill: every existing profile gets the starting EHTO grant once (beta is
-- small). New users get it at onboarding finalize instead.
insert into public.ticket_balances (user_id, kind, balance, updated_at)
select id, 'ehto', 10, now() from public.profiles
on conflict (user_id, kind) do nothing;
