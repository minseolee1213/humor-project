import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check your .env.local file and ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
  );
}

// Validate URL format
if (!supabaseUrl.startsWith("http://") && !supabaseUrl.startsWith("https://")) {
  throw new Error(
    `Invalid Supabase URL format. The URL must start with http:// or https://. Current value: "${supabaseUrl}". Please update NEXT_PUBLIC_SUPABASE_URL in your .env.local file with your actual Supabase project URL.`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
