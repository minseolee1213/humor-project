# Google OAuth Authentication Setup

## Implementation Complete ✅

The `/images` route is now protected with Google OAuth authentication using Supabase Auth.

## Files Created/Modified

### Created:
- `lib/supabase/server.ts` - Server-side Supabase client with SSR cookie handling
- `lib/supabase/client.ts` - Browser-side Supabase client
- `app/images/page.tsx` - Protected images page with auth check
- `app/images/SignInButton.tsx` - Google OAuth sign-in button
- `app/images/SignOutButton.tsx` - Sign out button
- `app/auth/callback/route.ts` - OAuth callback handler
- `middleware.ts` - Session refresh middleware

### Modified:
- `package.json` - Added `@supabase/ssr` dependency

## Supabase Configuration Required

### 1. Configure Google OAuth in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Providers**
3. Enable **Google** provider
4. Enter your Google OAuth Client ID:
   ```
   388960353527-fh4grc6mla425lg0e3g1hh67omtrdihd.apps.googleusercontent.com
   ```
5. **Important**: Add the redirect URL to Google OAuth settings:
   - Production: `https://my-next-app-ten-mu.vercel.app/auth/callback`
   - Local dev: `http://localhost:3000/auth/callback`

### 2. Google Cloud Console Configuration

In your Google Cloud Console (where you created the OAuth client):

1. Go to **APIs & Services** → **Credentials**
2. Click on your OAuth 2.0 Client ID
3. Add these **Authorized redirect URIs**:
   - `https://my-next-app-ten-mu.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (for local development)

## Environment Variables

### Required for Production (Vercel):

Add these in Vercel Dashboard → Project Settings → Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://qihsgnfjqmkjmoowyfbn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_SITE_URL=https://my-next-app-ten-mu.vercel.app
```

### For Local Development (.env.local):

```
NEXT_PUBLIC_SUPABASE_URL=https://qihsgnfjqmkjmoowyfbn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## How It Works

1. **Unauthenticated users** visiting `/images` see a gated UI with "Sign in with Google" button
2. **Clicking "Sign in with Google"** redirects to Google OAuth
3. **After Google authentication**, user is redirected to `/auth/callback`
4. **Callback route** exchanges the OAuth code for a session and redirects to `/images`
5. **Authenticated users** see the images gallery with a "Sign Out" button

## Testing

1. **Local Development**:
   ```bash
   npm run dev
   ```
   Visit `http://localhost:3000/images`

2. **Production**:
   After deploying, visit `https://my-next-app-ten-mu.vercel.app/images`

## Notes

- The redirect URI is exactly `/auth/callback` (no query parameters)
- OAuth redirect URL is: `https://my-next-app-ten-mu.vercel.app/auth/callback` (production)
- Session is managed via HTTP-only cookies (secure)
- No secrets are exposed to the client bundle
- Server-side authentication check protects the route
