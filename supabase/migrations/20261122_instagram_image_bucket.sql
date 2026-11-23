-- Public read access is necessary for Meta to retrieve outgoing images by HTTPS URL.
-- Only the Edge Function (service_role) uploads; browser users have no write policy.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('crm-instagram-outbound','crm-instagram-outbound',true,5000000,ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public=true,file_size_limit=5000000,allowed_mime_types=ARRAY['image/jpeg'];
-- NOTE: Images in this bucket are public to anyone with the URL. Do not upload sensitive images.
