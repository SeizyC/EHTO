-- Allow the world owner to delete their own messages.
-- Member messages are not user-deletable (they're "spoken" by NPCs).

create policy "messages: owner delete own"
  on public.messages for delete
  using (
    owner_user_id = auth.uid()
    and exists (select 1 from public.worlds w
                where w.id = messages.world_id
                  and w.owner_id = auth.uid())
  );
