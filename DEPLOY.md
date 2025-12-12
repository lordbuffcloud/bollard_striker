# 🚀 Deployment Guide - Vercel Native Database Setup

This guide will walk you through setting up Vercel Postgres and deploying your updates.

## Step 1: Install Dependencies

First, make sure you have the required packages installed:

```bash
cd bollard_striker
npm install
```

This installs `@vercel/postgres` which is needed for the native database connection.

## Step 2: Create Vercel Postgres Database

1. **Go to your Vercel Dashboard**: https://vercel.com/dashboard
2. **Select your project** (or create a new one if needed)
3. **Navigate to Storage**:
   - Click on your project
   - Go to the **Storage** tab
   - Click **Create Database**
   - Select **Postgres**
4. **Configure the database**:
   - Choose a name (e.g., `bollard-leaderboard`)
   - Select a region (choose closest to your users)
   - Click **Create**

Vercel will automatically:
- Create the database
- Set up the `POSTGRES_URL` environment variable
- Provide connection credentials

## Step 3: Initialize the Database Table

The table will be created automatically on first API call, but you can also create it manually:

1. **In Vercel Dashboard**:
   - Go to **Storage** → Your Postgres database
   - Click **Data** tab
   - Click **SQL Editor**
2. **Run this SQL**:

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

## Step 4: Verify Environment Variables

1. **In Vercel Dashboard**:
   - Go to your project → **Settings** → **Environment Variables**
2. **Check that `POSTGRES_URL` exists**:
   - It should be automatically added when you created the database
   - Format: `postgres://default:xxxxx@xxxxx.xxxxx.vercel-storage.com:5432/verceldb`
3. **If it's missing**, you can find it in:
   - Storage → Your database → **Settings** → **Connection String**

## Step 5: Deploy Your Updates

### Option A: Deploy via Vercel CLI (Recommended)

```bash
# Make sure you're in the project directory
cd bollard_striker

# Login to Vercel (if not already)
npx vercel login

# Link your project (if not already linked)
npx vercel link

# Deploy to production
npx vercel --prod

# Or deploy to preview
npx vercel
```

### Option B: Deploy via Git (Automatic)

If your project is connected to Git (GitHub, GitLab, etc.):

1. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Add Vercel Postgres support and glob patterns"
   git push origin main
   ```

2. **Vercel will automatically deploy**:
   - Push to `main` branch → Production deployment
   - Push to other branches → Preview deployment

### Option C: Deploy via Vercel Dashboard

1. Go to your project in Vercel Dashboard
2. Click **Deployments** tab
3. Click **Redeploy** on the latest deployment
4. Or connect your Git repository for automatic deployments

## Step 6: Test the Global Leaderboard

1. **Visit your deployed site**: `https://your-project.vercel.app`
2. **Play a game** and submit a score
3. **Check the leaderboard**:
   - It should show "🌐 Global Leaderboard (vercel-postgres)"
   - Your score should appear
4. **Test from different devices/browsers**:
   - Scores should be shared across all players
   - Refresh the leaderboard to see updates

## Step 7: Verify Database Connection

### Check via Vercel Dashboard:

1. Go to **Storage** → Your Postgres database
2. Click **Data** tab
3. You should see the `leaderboard` table
4. Click on it to see entries

### Check via API:

```bash
# Test the API endpoint
curl https://your-project.vercel.app/api/leaderboard

# Should return JSON with entries array
```

## Troubleshooting

### Issue: "Leaderboard not configured" error

**Solution**:
1. Check that `POSTGRES_URL` is set in Environment Variables
2. Make sure you've deployed after adding the database
3. Verify the database is active in Storage tab

### Issue: Table doesn't exist

**Solution**:
1. The table is created automatically on first API call
2. Or manually create it using SQL Editor (see Step 3)
3. Check Vercel function logs for errors

### Issue: Package not found (@vercel/postgres)

**Solution**:
```bash
# Make sure package.json exists and has the dependency
npm install

# Redeploy
npx vercel --prod
```

### Issue: Environment variables not working

**Solution**:
1. Environment variables are set per environment (Production, Preview, Development)
2. Make sure you set them for the correct environment
3. After adding variables, you need to redeploy

### Check Function Logs:

1. Go to Vercel Dashboard → Your project → **Functions** tab
2. Click on `api/leaderboard.js`
3. View logs to see any errors

## Quick Commands Reference

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

# Check environment variables
npx vercel env ls
```

## Next Steps

- ✅ Database is set up
- ✅ Environment variables are configured
- ✅ Code is deployed
- ✅ Leaderboard is working globally

Your global leaderboard is now live! All players will see the same scores across devices and browsers.

