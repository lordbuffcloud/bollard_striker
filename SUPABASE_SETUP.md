# 🚀 Supabase Leaderboard Setup Guide

This guide will help you set up your Supabase database for the Bollard Striker leaderboard.

## ✅ What You Already Have

Based on your Supabase project, you have:
- ✅ **SUPABASE_URL**: `https://bwvmgqxuqxozwolqcnjr.supabase.co`
- ✅ **SUPABASE_SERVICE_ROLE_KEY**: (Available in your project settings)
- ✅ Supabase project is initialized

---

## Step 1: Create the Leaderboard Table

### Option A: Using Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**:
   - Click **"Open in Supabase"** button in Vercel
   - Or go to: https://supabase.com/dashboard/project/bwvmgqxuqxozwolqcnjr

2. **Go to SQL Editor**:
   - Click **SQL Editor** in the left sidebar
   - Click **New Query**

3. **Run this SQL**:

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

-- Allow public read access (anyone can view leaderboard)
CREATE POLICY "public_read_leaderboard"
ON public.leaderboard
FOR SELECT
TO anon, authenticated
USING (true);

-- Note: Writes are done via service role key in the serverless function
-- No public write policy needed - API uses service role for writes
```

4. **Click "Run"** (or press Ctrl+Enter)

5. **Verify the table was created**:
   - Go to **Table Editor** in the left sidebar
   - You should see the `leaderboard` table
   - It should be empty initially

### Option B: Using Table Editor (Alternative)

1. Go to **Table Editor** → **New Table**
2. Table name: `leaderboard`
3. Add columns:
   - `id` - Type: `int8` - Primary key - Default: `auto increment`
   - `name` - Type: `text` - Required: Yes - Unique: Yes
   - `score` - Type: `int4` - Required: Yes - Default: `0`
   - `level` - Type: `int4` - Required: Yes - Default: `1`
   - `date` - Type: `timestamptz` - Required: Yes - Default: `now()`
4. Click **Save**
5. Go to **SQL Editor** and run the RLS policy SQL from Option A

---

## Step 2: Get Your Service Role Key

1. **In Supabase Dashboard**:
   - Go to **Project Settings** (gear icon) → **API**
   - Scroll down to **Project API keys**
   - Find **`service_role`** key (⚠️ Keep this secret!)
   - Click **Copy** or **Reveal** to see it

2. **Save this key** - You'll need it in Step 3

---

## Step 3: Set Environment Variables in Vercel

1. **Go to Vercel Dashboard**:
   - Navigate to your `bollard-striker` project
   - Go to **Settings** → **Environment Variables**

2. **Add SUPABASE_URL**:
   - **Key**: `SUPABASE_URL`
   - **Value**: `https://bwvmgqxuqxozwolqcnjr.supabase.co`
   - **Environment**: Select all (Production, Preview, Development)
   - Click **Save**

3. **Add SUPABASE_SERVICE_ROLE_KEY**:
   - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: Your service_role key from Step 2
   - **Environment**: Select all (Production, Preview, Development)
   - ⚠️ **Important**: Check **"Sensitive"** checkbox
   - Click **Save**

### Verify Environment Variables

You should now have these set:
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`

**Note**: Vercel may have automatically added some Supabase variables when you connected Supabase. Check if these exist:
- `NEXT_PUBLIC_SUPABASE_URL` (for client-side, not needed for our API)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (for client-side, not needed for our API)

These are fine to keep, but our API only needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

## Step 4: Deploy Your Changes

```bash
cd bollard_striker

# Make sure dependencies are installed
npm install

# Deploy to production
npx vercel --prod
```

Or if you have Git connected, just push your changes and Vercel will auto-deploy.

---

## Step 5: Test the Leaderboard

1. **Visit your deployed site**: `https://your-project.vercel.app`

2. **Play a game** and submit a score

3. **Check the leaderboard**:
   - It should show: **🌐 Global Leaderboard (supabase)**
   - Your score should appear

4. **Verify in Supabase**:
   - Go to Supabase Dashboard → **Table Editor** → `leaderboard`
   - You should see your entry

---

## Step 6: Test via API (Optional)

You can test the API directly:

```bash
# Get leaderboard
curl https://your-project.vercel.app/api/leaderboard

# Should return JSON like:
# {
#   "entries": [
#     { "name": "YourName", "score": 100, "level": 5, "date": "2024-01-01 12:00:00" }
#   ],
#   "source": "supabase"
# }
```

---

## 🔍 Troubleshooting

### Issue: "Leaderboard not configured" (501 error)

**Solutions**:
1. ✅ Check `SUPABASE_URL` is set correctly
2. ✅ Check `SUPABASE_SERVICE_ROLE_KEY` is set (not the anon key!)
3. ✅ Verify you redeployed after adding environment variables
4. ✅ Check Vercel function logs for errors

### Issue: Table doesn't exist

**Solutions**:
1. Run the SQL from Step 1 in Supabase SQL Editor
2. Verify table exists in Table Editor
3. Check table name is exactly `leaderboard` (lowercase)

### Issue: Permission denied

**Solutions**:
1. Make sure RLS policy is created (see Step 1)
2. Verify service_role key is used (not anon key)
3. Check RLS is enabled on the table

### Issue: Scores not appearing

**Solutions**:
1. Check Supabase Table Editor - are entries there?
2. Check Vercel function logs for errors
3. Try refreshing the leaderboard (🔄 Refresh button)
4. Verify API is returning `"source": "supabase"`

### Issue: Wrong service role key

**Solutions**:
1. Go to Supabase → Project Settings → API
2. Copy the **`service_role`** key (not `anon` key)
3. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel
4. Redeploy

---

## 🔐 Security Notes

1. **Service Role Key**:
   - ⚠️ **NEVER** expose this client-side
   - ⚠️ Only use in serverless functions
   - ⚠️ Mark as "Sensitive" in Vercel

2. **Row Level Security (RLS)**:
   - ✅ Enabled for security
   - ✅ Public can read (view leaderboard)
   - ✅ Only service role can write (via API)

3. **API Endpoint**:
   - ✅ Uses service role for writes
   - ✅ Validates and sanitizes all inputs
   - ✅ Prevents SQL injection

---

## 📊 Viewing Your Data

### In Supabase Dashboard:
- **Table Editor**: View/edit entries directly
- **SQL Editor**: Run custom queries
- **API Docs**: See auto-generated API docs

### Example Queries:

```sql
-- Get top 10 scores
SELECT name, score, level, date
FROM leaderboard
ORDER BY score DESC
LIMIT 10;

-- Get player's best score
SELECT name, MAX(score) as best_score
FROM leaderboard
WHERE name = 'YourName'
GROUP BY name;

-- Count total entries
SELECT COUNT(*) FROM leaderboard;
```

---

## ✅ Checklist

- [ ] Leaderboard table created in Supabase
- [ ] RLS policy created for public read access
- [ ] Index created on score column
- [ ] `SUPABASE_URL` set in Vercel environment variables
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in Vercel (marked as Sensitive)
- [ ] Deployed to Vercel
- [ ] Tested leaderboard submission
- [ ] Verified scores appear in Supabase Table Editor
- [ ] Leaderboard shows "🌐 Global Leaderboard (supabase)"

---

## 🎉 You're Done!

Your Supabase leaderboard is now set up and working! All players will see the same global leaderboard.

**Next Steps**:
- Monitor leaderboard activity in Supabase Table Editor
- Consider adding analytics or rate limiting
- Customize leaderboard display (top 10, top 25, etc.)

---

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

---

**Need Help?** Check the function logs in Vercel Dashboard → Your project → Functions → `api/leaderboard.js`

