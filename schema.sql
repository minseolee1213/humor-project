-- Images table schema (actual schema from database)
CREATE TABLE IF NOT EXISTS public.images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_datetime_utc timestamp with time zone NOT NULL DEFAULT now(),
  modified_datetime_utc timestamp with time zone NULL,
  url character varying NULL,
  is_common_use boolean NULL DEFAULT false,
  profile_id uuid NULL DEFAULT auth.uid(),
  additional_context character varying NULL,
  is_public boolean NULL DEFAULT false,
  image_description text NULL,
  celebrity_recognition text NULL,
  embedding public.vector NULL,
  CONSTRAINT images_pkey PRIMARY KEY (id),
  CONSTRAINT images_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE SET NULL
) TABLESPACE pg_default;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_images_is_common_use ON public.images USING btree (is_common_use) TABLESPACE pg_default
WHERE (is_common_use = true);

CREATE INDEX IF NOT EXISTS idx_images_is_public ON public.images USING btree (is_public) TABLESPACE pg_default
WHERE (is_public = true);

CREATE INDEX IF NOT EXISTS idx_images_profile_id ON public.images USING btree (profile_id) TABLESPACE pg_default;
