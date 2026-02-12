import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Error exchanging code for session:', error);
        // Still redirect even if there's an error
      }
    } catch (error) {
      console.error('Error in callback route:', error);
      // Still redirect even if there's an error
    }
  }

  // Redirect to /images without query parameters
  return NextResponse.redirect(new URL('/images', requestUrl.origin));
}
