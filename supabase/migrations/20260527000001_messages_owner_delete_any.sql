-- World owner can delete ANY message in their world (their own + NPC/AI lines).
-- Previously only owner_user_id = auth.uid() rows were deletable; the owner
-- now has full moderation control over their plaza's chat log.

create policy "messages: world owner delete any"
  on public.messages for delete
  using (
    exists (
      select 1 from public.worlds w
       where w.id = messages.world_id
         and w.owner_id = auth.uid()
    )
  );
