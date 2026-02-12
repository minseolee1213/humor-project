import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create a dummy client if env vars are missing (for build time)
let supabaseClient;

if (!supabaseUrl || !supabaseAnonKey) {
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction
    ? "❌ Missing Supabase environment variables in production! Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your deployment platform (Vercel/Netlify/etc). See DEPLOYMENT.md for instructions."
    : "Missing Supabase environment variables. Using dummy client. Please check your .env.local file.";
  
  console.error(message);
  
  // Create a dummy client (will fail on actual queries, but won't break the build)
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
