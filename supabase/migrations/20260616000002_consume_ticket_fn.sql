-- Atomic single-ticket consume. Decrements only when a balance is available,
-- in one statement (no read-modify-write race). Returns the new balance, or
-- no row when there was nothing to spend. Called via the service role.

create or replace function public.consume_ticket(p_user uuid, p_kind text)
returns integer
language sql
as $$
  update public.ticket_balances
     set balance = balance - 1, updated_at = now()
   where user_id = p_user and kind = p_kind and balance > 0
  returning balance;
$$;
