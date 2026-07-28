-- Create the crop-images storage bucket for scan photo uploads.
-- The bucket is public so image_url values can be rendered without auth tokens.

insert into storage.buckets (id, name, public)
values ('crop-images', 'crop-images', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder (user_id/filename).
create policy "crop-images: authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'crop-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read access to all images.
create policy "crop-images: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'crop-images');

-- Allow users to delete their own images.
create policy "crop-images: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'crop-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
