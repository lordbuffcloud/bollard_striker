# 🌐 Global Leaderboard Setup Guide for Vercel

This guide will walk you through setting up a **global leaderboard** for Bollard Striker on Vercel. The game supports multiple backend options, with Vercel Postgres being the recommended choice.

## 📋 Overview

The leaderboard API (`/api/leaderboard.js`) automatically selects the best available backend in this priority order:

1. **Vercel Postgres** (Native) ⭐ **Recommended**
2. **Supabase** (PostgreSQL via REST)
3. **Vercel KV** (Redis-based)
4. **Local Storage** (Fallback if no backend configured)

The frontend automatically detects which backend is active and displays a status indicator.

---

## 🚀 Option 1: Vercel Postgres (Recommended)

Vercel Postgres is the **easiest and most integrated** solution for Vercel deployments.

### Step 1: Install Dependencies

```bash
cd bollard_striker
npm install
```

This installs `@vercel/postgres` which is required for the database connection.

### Step 2: Create Postgres Database

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Select your project** (or create one if needed)
3. **Navigate to Storage**:
   - Click on your project
   - Go to the **Storage** tab
   - Click **Create Database**
   - Select **Postgres**
4. **Configure**:
   - Name: `bollard-leaderboard` (or any name you prefer)
   - Region: Choose closest to your users
   - Click **Create**

✅ Vercel automatically:
- Creates the database
- Sets the `POSTGRES_URL` environment variable
- Provides connection credentials

### Step 3: Initialize Database Table

The table is created **automatically** on the first API call, but you can also create it manually:

#### Option A: Automatic (Recommended)
Just deploy and play! The table will be created on first use.

#### Option B: Manual Setup
1. In Vercel Dashboard → **Storage** → Your Postgres database
2. Click **Data** tab → **SQL Editor**
3. Run this SQL:

```sql
CREATE TABLE IF NOT EXISTS leaderboard (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  score INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);
```

### Step 4: Verify Environment Variables

1. **In Vercel Dashboard**:
   - Go to your project → **Settings** → **Environment Variables**
2. **Check `POSTGRES_URL`**:
   - Should be automatically added when you created the database
   - Format: `postgres://default:xxxxx@xxxxx.xxxxx.vercel-storage.com:5432/verceldb`
3. **If missing**:
   - Storage → Your database → **Settings** → **Connection String**

### Step 5: Deploy

```bash
# Login (if not already)
npx vercel login

# Link project (if not already)
npx vercel link

# Deploy to production
npx vercel --prod
```

### Step 6: Test

1. Visit your deployed site: `https://your-project.vercel.app`
2. Play a game and submit a score
3. Check the leaderboard - it should show:
   - **🌐 Global Leaderboard (vercel-postgres)**
   - Your score should appear

✅ **Done!** Your global leaderboard is now live!

---

## 🔧 Option 2: Supabase Setup

Supabase provides a free PostgreSQL database with REST API access.

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click **New Project**
3. Fill in:
   - Name: `bollard-striker` (or any name)
   - Database Password: (save this!)
   - Region: Choose closest to your users
4. Click **Create new project**

### Step 2: Create Leaderboard Table

1. In Supabase Dashboard, go to **SQL Editor**
2. Click **New Query**
3. Run this SQL:

```sql
-- Create the leaderboard table
CREATE TABLE IF NOT EXISTS public.leaderboard (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(name)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON public.leaderboard(score DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "public_read" ON public.leaderboard
  FOR SELECT
  USING (true);

-- Note: Writes are done via service role key in the serverless function
```

### Step 3: Get Credentials

1. Go to **Project Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **service_role key**: (⚠️ Keep this secret! Never expose client-side)

### Step 4: Set Environment Variables in Vercel

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add:
   - **Key**: `SUPABASE_URL`
   - **Value**: Your Project URL (e.g., `https://xxxxx.supabase.co`)
   - **Environment**: Production, Preview, Development (select all)
3. Add:
   - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: Your service_role key
   - **Environment**: Production, Preview, Development (select all)
   - ⚠️ **Important**: Mark as "Sensitive"

### Step 5: Deploy

```bash
npx vercel --prod
```

### Step 6: Test

The leaderboard should show: **🌐 Global Leaderboard (supabase)**

---

## ⚡ Option 3: Vercel KV Setup

Vercel KV uses Redis for key-value storage (simpler but less powerful than Postgres).

### Step 1: Create KV Database

1. In Vercel Dashboard → **Storage** → **Create Database**
2. Select **KV**
3. Configure:
   - Name: `bollard-leaderboard-kv`
   - Region: Choose closest to your users
4. Click **Create**

✅ Vercel automatically sets:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

### Step 2: Deploy

```bash
npx vercel --prod
```

### Step 3: Test

The leaderboard should show: **🌐 Global Leaderboard (kv)**

---

## 🧪 Testing Your Setup

### Test via Browser

1. Visit your deployed site
2. Play a game
3. Submit a score with your name
4. Check the leaderboard - should show:
   - **🌐 Global Leaderboard (backend-name)**
   - Your score should appear

### Test via API

```bash
# Get leaderboard
curl https://your-project.vercel.app/api/leaderboard

# Should return JSON like:
# {
#   "entries": [
#     { "name": "Player1", "score": 100, "level": 5, "date": "2024-01-01 12:00:00" }
#   ],
#   "source": "vercel-postgres"
# }
```

### Test from Multiple Devices

1. Open the game on different devices/browsers
2. Submit scores from each
3. All scores should appear in the same global leaderboard

---

## 🔍 Troubleshooting

### Issue: "Leaderboard not configured" (501 error)

**Symptoms**: Leaderboard shows "📱 Local Leaderboard (Global unavailable)"

**Solutions**:
1. ✅ Check environment variables are set:
   - For Vercel Postgres: `POSTGRES_URL`
   - For Supabase: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - For KV: `KV_REST_API_URL` and `KV_REST_API_TOKEN`
2. ✅ Verify variables are set for the correct environment (Production/Preview/Development)
3. ✅ **Redeploy** after adding environment variables:
   ```bash
   npx vercel --prod
   ```
4. ✅ Check Vercel function logs:
   - Dashboard → Your project → **Functions** → `api/leaderboard.js` → View logs

### Issue: Table doesn't exist

**Solutions**:
1. The table is created automatically on first API call
2. Or manually create it using SQL Editor (see Option 1, Step 3)
3. Check function logs for errors

### Issue: Package not found (@vercel/postgres)

**Solutions**:
```bash
# Make sure dependencies are installed
cd bollard_striker
npm install

# Redeploy
npx vercel --prod
```

### Issue: Scores not appearing

**Solutions**:
1. Check function logs for errors
2. Verify database connection:
   - Vercel Postgres: Check Storage → Data tab
   - Supabase: Check Table Editor
   - KV: Check Storage → Data tab
3. Try refreshing the leaderboard (🔄 Refresh button)
4. Check browser console for errors

### Issue: Environment variables not working

**Solutions**:
1. Environment variables are set per environment:
   - Make sure you set them for Production, Preview, AND Development
2. After adding variables, **redeploy**:
   ```bash
   npx vercel --prod
   ```
3. Verify in Dashboard → Settings → Environment Variables

---

## 📊 Viewing Your Database

### Vercel Postgres
- Dashboard → Storage → Your database → **Data** tab
- View entries, run SQL queries

### Supabase
- Dashboard → **Table Editor** → `leaderboard`
- View and edit entries directly

### Vercel KV
- Dashboard → Storage → Your KV database → **Data** tab
- View key-value pairs

---

## 🔐 Security Notes

1. **Service Role Keys**: Never expose Supabase service role keys client-side. They're only used in serverless functions.

2. **Environment Variables**: Mark sensitive values (like API keys) as "Sensitive" in Vercel.

3. **Rate Limiting**: Consider adding rate limiting for production (not included by default).

4. **Input Validation**: The API sanitizes all inputs, but consider additional validation for production.

---

## 🎯 Quick Reference

### Environment Variables Summary

| Backend | Required Variables |
|---------|-------------------|
| Vercel Postgres | `POSTGRES_URL` (auto-set) |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Vercel KV | `KV_REST_API_URL`, `KV_REST_API_TOKEN` (auto-set) |

### Deployment Commands

```bash
# Install dependencies
npm install

# Test locally
npx vercel dev

# Deploy to preview
npx vercel

# Deploy to production
npx vercel --prod

# View logs
npx vercel logs

# List environment variables
npx vercel env ls
```

---

## ✅ Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Database created (Postgres/Supabase/KV)
- [ ] Environment variables set
- [ ] Table created (if manual setup)
- [ ] Deployed to Vercel (`npx vercel --prod`)
- [ ] Tested leaderboard submission
- [ ] Verified scores appear globally
- [ ] Checked function logs for errors

---

## 🎮 Next Steps

Once your leaderboard is set up:

1. ✅ Share your game URL with players
2. ✅ Monitor leaderboard activity in your database dashboard
3. ✅ Consider adding analytics or rate limiting
4. ✅ Customize leaderboard display (top 10, top 25, etc.)

---

## 📚 Additional Resources

- [Vercel Postgres Docs](https://vercel.com/docs/storage/vercel-postgres)
- [Supabase Docs](https://supabase.com/docs)
- [Vercel KV Docs](https://vercel.com/docs/storage/vercel-kv)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

---

**Need Help?** Check the function logs in Vercel Dashboard or review the API code in `api/leaderboard.js`.

