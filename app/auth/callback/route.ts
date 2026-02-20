import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Force dynamic rendering since we use cookies for auth
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Handle OAuth errors
  if (errorParam) {
    console.error('OAuth error:', errorParam, errorDescription);
    // Redirect to home with error message (no query params)
    const homeUrl = new URL('/', requestUrl.origin);
    return NextResponse.redirect(homeUrl);
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (error) {
        console.error('Error exchanging code for session:', error);
        // Redirect to home on error (no query params)
        const homeUrl = new URL('/', requestUrl.origin);
        return NextResponse.redirect(homeUrl);
      }

      // Success - redirect to home page (or a protected route)
      // No query parameters in redirect URL
      const homeUrl = new URL('/', requestUrl.origin);
      return NextResponse.redirect(homeUrl);
    } catch (error) {
      console.error('Error in callback route:', error);
      // Redirect to home on error (no query params)
      const homeUrl = new URL('/', requestUrl.origin);
      return NextResponse.redirect(homeUrl);
    }
  }

  // No code parameter - redirect to home
  const homeUrl = new URL('/', requestUrl.origin);
  return NextResponse.redirect(homeUrl);
}
