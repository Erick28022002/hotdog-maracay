-- Allow the authenticated employee app to upload clock-in selfies.
-- The bucket is already public; these policies only restore authenticated writes.

drop policy if exists selfies_authenticated_read on storage.objects;
drop policy if exists selfies_authenticated_insert on storage.objects;
drop policy if exists selfies_authenticated_update_own on storage.objects;

create policy selfies_authenticated_read
on storage.objects
for select
to authenticated
using (bucket_id = 'selfies');

create policy selfies_authenticated_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'selfies');

create policy selfies_authenticated_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'selfies'
  and (
    owner = (select auth.uid())
    or owner_id = (select auth.uid())::text
  )
)
with check (
  bucket_id = 'selfies'
  and (
    owner = (select auth.uid())
    or owner_id = (select auth.uid())::text
  )
);
