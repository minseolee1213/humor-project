-- Fix Row Level Security (RLS) policies for images table
-- Run this in your Supabase SQL Editor

-- Option 1: Disable RLS completely (for public read access)
-- ALTER TABLE public.images DISABLE ROW LEVEL SECURITY;

-- Option 2: Enable RLS but create a policy for public read access
-- This is the recommended approach for production

-- First, enable RLS if not already enabled
ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows anyone to read public images
CREATE POLICY "Allow public read access to public images"
ON public.images
FOR SELECT
USING (is_public = true);

-- OR if you want to allow reading ALL images (not just public ones):
-- CREATE POLICY "Allow public read access to all images"
-- ON public.images
-- FOR SELECT
-- USING (true);

-- To check current policies:
-- SELECT * FROM pg_policies WHERE tablename = 'images';

-- To drop a policy if needed:
-- DROP POLICY IF EXISTS "Allow public read access to public images" ON public.images;
