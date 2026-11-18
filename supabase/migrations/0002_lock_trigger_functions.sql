-- Trigger functions only ever run from their triggers. Stop them being callable through
-- the API (/rest/v1/rpc/...). Triggers keep firing: firing does not check EXECUTE.
--
-- The is_* helper functions stay callable on purpose: row-level security policies run them
-- as the signed-in user, and each only answers a yes/no about that same user.
revoke execute on function public.handle_new_user()      from public, anon, authenticated;
revoke execute on function public.on_review_change()     from public, anon, authenticated;
revoke execute on function public.on_sub_rating_change() from public, anon, authenticated;
revoke execute on function public.on_message_insert()    from public, anon, authenticated;
