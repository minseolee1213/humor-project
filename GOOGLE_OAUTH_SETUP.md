# Google OAuth Setup Instructions

## Google OAuth Client ID
**Client ID:** `388960353527-fh4grc6mla425lg0e3g1hh67omtrdihd.apps.googleusercontent.com`

## Supabase Configuration Steps

1. **Go to your Supabase Dashboard**
   - Navigate to: Authentication → Providers → Google

2. **Enable Google Provider**
   - Toggle "Enable Google provider" to ON

3. **Configure Google OAuth Client ID**
   - **Client ID (for Supabase):** `388960353527-fh4grc6mla425lg0e3g1hh67omtrdihd.apps.googleusercontent.com`
   - **Client Secret:** You'll need to get this from Google Cloud Console (see below)

4. **Configure Redirect URLs in Google Cloud Console**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to: APIs & Services → Credentials
   - Find your OAuth 2.0 Client ID
   - Add these Authorized redirect URIs:
     - For local development: `http://localhost:3000/auth/callback`
     - For production: `https://your-domain.com/auth/callback`
     - Supabase callback: `https://your-project-ref.supabase.co/auth/v1/callback`

5. **Get Client Secret**
   - In Google Cloud Console, click on your OAuth 2.0 Client ID
   - Copy the "Client secret" value
   - Paste it into Supabase Dashboard → Authentication → Providers → Google → Client Secret

6. **Save Configuration**
   - Click "Save" in Supabase Dashboard

## Environment Variables

Make sure these are set in your `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000  # For local dev, or your production URL
```

## Testing

1. Start your dev server: `npm run dev`
2. Navigate to `http://localhost:3000`
3. You should see the gated UI with "Sign in with Google" button
4. Click the button to test Google OAuth flow
5. After successful authentication, you'll be redirected back to the home page

## Troubleshooting

- **"Redirect URI mismatch" error**: Make sure the redirect URI in Google Cloud Console matches exactly with what's configured in Supabase
- **"Invalid client" error**: Verify the Client ID and Client Secret are correct in Supabase Dashboard
- **Callback not working**: Check that `/auth/callback` route is accessible and the redirect URL includes the correct domain
