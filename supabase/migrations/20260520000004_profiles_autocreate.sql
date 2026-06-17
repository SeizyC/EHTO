-- Auto-create a profiles row whenever a new auth.users row appears.
-- This means signup → profile row exists immediately, no client-side
-- bootstrap needed. Trigger uses security definer so it can write across
-- the auth → public boundary.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
