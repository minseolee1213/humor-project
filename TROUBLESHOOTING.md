# Troubleshooting Vercel Deployment

## Common Build Errors

### 1. Middleware Error (MIDDLEWARE_INVOCATION_FAILED)

**Symptoms:**
- Error: `500: INTERNAL_SERVER_ERROR`
- Code: `MIDDLEWARE_INVOCATION_FAILED`

**Solutions:**
- ✅ Already fixed: Added error handling in `middleware.ts`
- Make sure environment variables are set in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL`

### 2. Build Timeout

**Symptoms:**
- Build hangs or times out
- "Build exceeded maximum duration"

**Solutions:**
- Check if you're fetching too much data during build
- The `/images` page fetches images at build time - this is normal
- If you have 298 images, the build should still complete

### 3. Environment Variables Missing

**Symptoms:**
- Build succeeds but runtime errors
- "Missing Supabase environment variables"

**Solutions:**
1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add all three required variables
3. Make sure to select: Production, Preview, Development
4. **Redeploy** after adding variables

### 4. TypeScript Errors

**Symptoms:**
- Build fails with TypeScript errors
- Type errors in console

**Solutions:**
- Run `npm run build` locally first to catch errors
- Check that all imports are correct
- Verify `@supabase/ssr` is installed

## How to Get Full Error Logs from Vercel

1. Go to Vercel Dashboard → Your Project
2. Click on the failed deployment
3. Click "View Function Logs" or "View Build Logs"
4. Scroll to find the actual error message
5. Look for red error text or stack traces

## Quick Fixes

### If build fails:
```bash
# Test locally first
npm run build

# If local build works, the issue is likely:
# 1. Missing environment variables in Vercel
# 2. Vercel-specific configuration issue
```

### If runtime fails:
1. Check Vercel Function Logs
2. Check browser console (F12)
3. Verify all environment variables are set
4. Check Supabase dashboard for connection issues

## Current Status

✅ Middleware error handling added
✅ Callback route error handling added
✅ Images page error handling added
✅ Build works locally

## Next Steps

1. **Share the full error message** from Vercel logs
2. **Verify environment variables** are set in Vercel
3. **Check Vercel Function Logs** for runtime errors
4. **Test locally** with `npm run build` to ensure it works
