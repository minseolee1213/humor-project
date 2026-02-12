# Deployment Guide - Vercel

## Step 1: Push Your Code to GitHub

If you haven't already, push your code to a GitHub repository:

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit with Google OAuth authentication"

# Add your GitHub remote (replace with your repo URL)
git remote add origin https://github.com/yourusername/your-repo.git

# Push to GitHub
git push -u origin main
```

## Step 2: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended)

1. **Go to [Vercel Dashboard](https://vercel.com/dashboard)**
2. **Click "Add New..." → "Project"**
3. **Import your GitHub repository**
   - Select your repository from the list
   - Click "Import"
4. **Configure Project Settings:**
   - Framework Preset: **Next.js** (auto-detected)
   - Root Directory: `./` (leave as default)
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `.next` (auto-detected)
5. **Click "Deploy"** (we'll add environment variables after)

### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI globally
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (from your project directory)
vercel

# Follow the prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N (or Y if you have one)
# - Project name? (press enter for default)
# - Directory? ./
# - Override settings? N
```

## Step 3: Configure Environment Variables

**After your first deployment**, configure environment variables:

1. **Go to Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. **Add these three variables:**

   ```
   Name: NEXT_PUBLIC_SUPABASE_URL
   Value: https://qihsgnfjqmkjmoowyfbn.supabase.co
   Environment: Production, Preview, Development
   ```

   ```
   Name: NEXT_PUBLIC_SUPABASE_ANON_KEY
   Value: [Your Supabase anon key from .env.local]
   Environment: Production, Preview, Development
   ```

   ```
   Name: NEXT_PUBLIC_SITE_URL
   Value: https://my-next-app-ten-mu.vercel.app
   Environment: Production, Preview, Development
   ```

3. **Click "Save"** for each variable
4. **Important**: After adding variables, you must **Redeploy**:
   - Go to **Deployments** tab
   - Click the three dots (⋯) on the latest deployment
   - Click **"Redeploy"**

## Step 4: Configure Supabase Google OAuth

### In Supabase Dashboard:

1. **Go to your Supabase project**: https://supabase.com/dashboard
2. **Navigate to**: Authentication → **Providers**
3. **Find "Google"** and click to enable it
4. **Enter your Google OAuth Client ID**:
   ```
   388960353527-fh4grc6mla425lg0e3g1hh67omtrdihd.apps.googleusercontent.com
   ```
5. **Leave "Client Secret" empty** (not required)
6. **Click "Save"**

### In Google Cloud Console:

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Navigate to**: APIs & Services → **Credentials**
3. **Click on your OAuth 2.0 Client ID** (the one with the ID above)
4. **Under "Authorized redirect URIs"**, add:
   ```
   https://my-next-app-ten-mu.vercel.app/auth/callback
   ```
5. **Also add for local development**:
   ```
   http://localhost:3000/auth/callback
   ```
6. **Click "Save"**

## Step 5: Verify Deployment

1. **Visit your deployed site**: `https://my-next-app-ten-mu.vercel.app/images`
2. **You should see**:
   - Gated UI with "Sign in with Google" button (if not signed in)
   - Or the images gallery (if already signed in)
3. **Test the flow**:
   - Click "Sign in with Google"
   - Complete Google authentication
   - You should be redirected back to `/images` and see the gallery
   - Click "Sign Out" to test logout

## Troubleshooting

### Images not showing after sign-in:
- Check browser console (F12) for errors
- Verify Supabase RLS policies allow authenticated users
- Check that environment variables are set correctly in Vercel

### OAuth redirect not working:
- Verify the redirect URI in Google Cloud Console matches exactly: `https://my-next-app-ten-mu.vercel.app/auth/callback`
- Check that Google OAuth is enabled in Supabase
- Ensure `NEXT_PUBLIC_SITE_URL` is set correctly in Vercel

### Build errors:
- Check Vercel build logs in the Deployments tab
- Verify all environment variables are set
- Ensure `@supabase/ssr` is in `package.json` dependencies

## Quick Deploy Checklist

- [ ] Code pushed to GitHub
- [ ] Project deployed to Vercel
- [ ] Environment variables added in Vercel
- [ ] Vercel deployment redeployed after adding env vars
- [ ] Google OAuth enabled in Supabase
- [ ] Redirect URI added in Google Cloud Console
- [ ] Tested sign-in flow on deployed site

## Next Steps

After successful deployment:
- Your app will automatically redeploy on every `git push` to main branch
- Monitor deployments in Vercel Dashboard
- Check function logs if issues arise
- Update environment variables as needed (requires redeploy)
