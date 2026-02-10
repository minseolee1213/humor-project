import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create a dummy client if env vars are missing (for build time)
let supabaseClient;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing Supabase environment variables. Using dummy client. Please check your .env.local file."
  );
  // Create a dummy client with placeholder values
  supabaseClient = createClient("https://placeholder.supabase.co", "placeholder-key", {
    auth: { persistSession: false },
  });
} else if (!supabaseUrl.startsWith("http://") && !supabaseUrl.startsWith("https://")) {
  console.warn(
    `Invalid Supabase URL format. Using dummy client. Current value: "${supabaseUrl}"`
  );
  supabaseClient = createClient("https://placeholder.supabase.co", supabaseAnonKey, {
    auth: { persistSession: false },
  });
} else {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
}

export const supabase = supabaseClient;
