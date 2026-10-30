-- Octava parte (30-10): notas de voz en el chat
alter table chat add column if not exists audio_url text check (audio_url is null or char_length(audio_url) <= 600);
alter table chat add column if not exists audio_secs int check (audio_secs is null or audio_secs between 0 and 300);
drop policy if exists chat_write on chat;
create policy chat_write on chat for insert to authenticated
  with check (player = auth.uid() and is_player()
    and (char_length(body) > 0 or image_url is not null or audio_url is not null)
    and (audio_url is null or audio_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/'));
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac'],
       file_size_limit = 5242880
 where id = 'fotos';
