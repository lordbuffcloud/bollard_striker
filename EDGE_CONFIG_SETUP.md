# ⚠️ Edge Config Setup Guide (Not Recommended)

**Important**: Edge Config is **NOT recommended** for leaderboards because:
- ⚠️ **Read-optimized**: Writes are slower and may have delays
- ⚠️ **64KB size limit**: Can only store ~100-200 leaderboard entries
- ⚠️ **Designed for config**: Best for static/semi-static configuration data
- ⚠️ **Write complexity**: Requires Vercel API token for writes

## ✅ Better Alternatives

**For leaderboards, use instead:**
1. **Vercel Postgres** ⭐ (Recommended) - See `VERCEL_LEADERBOARD_SETUP.md`
2. **Vercel KV** - Fast Redis-based storage
3. **Supabase** - Full PostgreSQL database

---

## 🔧 Edge Config Setup (If You Still Want to Use It)

### Step 1: Install Dependencies

```bash
cd bollard_striker
npm install
```

This installs `@vercel/edge-config` package.

### Step 2: Get Your Edge Config Connection String

1. **In Vercel Dashboard**:
   - Go to your project → **Storage** → Your Edge Config store
   - Click **Settings** → **Connection String**
   - Copy the connection string (format: `https://edge-config.vercel.app/xxxxx?token=...`)

### Step 3: Set Environment Variables

1. **In Vercel Dashboard**:
   - Go to your project → **Settings** → **Environment Variables**
   - Add:
     - **Key**: `EDGE_CONFIG`
     - **Value**: Your connection string from Step 2
     - **Environment**: Production, Preview, Development (select all)
   - Add (for writes):
     - **Key**: `EDGE_CONFIG_TOKEN` or `VERCEL_TOKEN`
     - **Value**: Your Vercel API token (get from [Vercel Account Settings](https://vercel.com/account/tokens))
     - **Environment**: Production, Preview, Development (select all)
     - ⚠️ Mark as "Sensitive"

### Step 4: Initialize Edge Config Store

1. **In Vercel Dashboard**:
   - Go to **Storage** → Your Edge Config store
   - Click **Store Items** → **Add Item**
   - **Key**: `bollard_striker:leaderboard`
   - **Value**: `[]` (empty array)
   - Click **Save**

### Step 5: Deploy

```bash
npx vercel --prod
```

### Step 6: Test

The leaderboard should show: **🌐 Global Leaderboard (edge-config)**

---

## ⚠️ Limitations & Warnings

### Size Limit
- Edge Config has a **64KB total size limit**
- With ~25 leaderboard entries, you'll use ~2-5KB
- You can store multiple leaderboards, but total must stay under 64KB

### Write Performance
- Writes may take **1-5 seconds** to propagate globally
- Not ideal for real-time leaderboard updates
- Consider rate limiting writes

### Read Performance
- Reads are **very fast** (edge-optimized)
- Good for displaying leaderboards
- Bad for frequent updates

---

## 🔄 Migration to Better Backend

If you want to migrate from Edge Config to a better backend:

### To Vercel Postgres:
1. Follow `VERCEL_LEADERBOARD_SETUP.md` (Option 1)
2. The API will automatically use Postgres (higher priority)
3. Edge Config entries will be ignored

### To Vercel KV:
1. Follow `VERCEL_LEADERBOARD_SETUP.md` (Option 3)
2. The API will automatically use KV (higher priority)
3. Edge Config entries will be ignored

---

## 📊 When Edge Config Makes Sense

Edge Config is good for:
- ✅ Static configuration data
- ✅ Feature flags
- ✅ A/B test configurations
- ✅ Read-heavy, write-light data
- ✅ Small datasets (< 64KB)

Edge Config is **NOT** good for:
- ❌ Leaderboards (frequent writes)
- ❌ User-generated content
- ❌ Real-time data
- ❌ Large datasets (> 64KB)
- ❌ Data that changes frequently

---

## 🐛 Troubleshooting

### Issue: "Edge Config not configured"

**Solutions**:
1. Check `EDGE_CONFIG` environment variable is set
2. Verify connection string format is correct
3. Redeploy after adding environment variables

### Issue: "EDGE_CONFIG_TOKEN required for writes"

**Solutions**:
1. Set `EDGE_CONFIG_TOKEN` or `VERCEL_TOKEN` environment variable
2. Get token from [Vercel Account Settings](https://vercel.com/account/tokens)
3. Mark as "Sensitive" in environment variables

### Issue: Writes are slow

**This is expected** - Edge Config writes are slower than reads. Consider:
- Using Vercel Postgres or KV instead
- Implementing write queuing
- Reducing write frequency

### Issue: Size limit exceeded

**Solutions**:
1. Reduce number of leaderboard entries (keep top 25 instead of 100)
2. Migrate to Vercel Postgres or KV (no size limits)
3. Compress data if possible

---

## 📚 Additional Resources

- [Vercel Edge Config Docs](https://vercel.com/docs/storage/edge-config)
- [Edge Config API Reference](https://vercel.com/docs/storage/edge-config/edge-config-api)

---

## ✅ Recommendation

**Use Vercel Postgres instead** - It's:
- ✅ Better for leaderboards
- ✅ No size limits
- ✅ Faster writes
- ✅ Easier to set up
- ✅ Better for production use

See `VERCEL_LEADERBOARD_SETUP.md` for Postgres setup instructions.

