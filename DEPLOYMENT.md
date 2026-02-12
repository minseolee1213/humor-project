# Deployment Guide

## Setting Up Environment Variables

Your Next.js app needs Supabase credentials to work in production. You must set these environment variables in your deployment platform.

### Required Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon/public key

---

## Vercel Deployment

1. Go to your project on [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your project → **Settings** → **Environment Variables**
3. Add these variables:
   - **Name**: `NEXT_PUBLIC_SUPABASE_URL`
     **Value**: `https://qihsgnfjqmkjmoowyfbn.supabase.co`
   - **Name**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     **Value**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpaHNnbmZqcW1ram1vb3d5ZmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1Mjc0MDAsImV4cCI6MjA2NTEwMzQwMH0.c9UQS_o2bRygKOEdnuRx7x7PeSf_OUGDtf9l3fMqMSQ`
4. Make sure to select **Production**, **Preview**, and **Development** environments
5. Click **Save**
6. **Redeploy** your application (go to Deployments → click the three dots → Redeploy)

---

## Netlify Deployment

1. Go to your project on [Netlify Dashboard](https://app.netlify.com)
2. Click on your site → **Site settings** → **Environment variables**
3. Click **Add a variable**
4. Add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://qihsgnfjqmkjmoowyfbn.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpaHNnbmZqcW1ram1vb3d5ZmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1Mjc0MDAsImV4cCI6MjA2NTEwMzQwMH0.c9UQS_o2bRygKOEdnuRx7x7PeSf_OUGDtf9l3fMqMSQ`
5. Click **Save**
6. **Trigger a new deploy** (Deploys → Trigger deploy)

---

## Other Platforms

For other platforms (Railway, Render, etc.):
1. Find the **Environment Variables** or **Config** section in your dashboard
2. Add the same two variables as above
3. Redeploy your application

---

## Verify It's Working

After setting environment variables and redeploying:
1. Check the browser console on your deployed site (F12)
2. Look for: "Successfully fetched X images" (not errors)
3. If you see "Missing Supabase environment variables" warning, the env vars aren't set correctly

---

## Important Notes

- ⚠️ **Never commit `.env.local` to git** - it's already in `.gitignore`
- ✅ Environment variables set in your deployment platform are secure and not exposed in your code
- 🔄 After adding/changing environment variables, you **must redeploy** for changes to take effect
