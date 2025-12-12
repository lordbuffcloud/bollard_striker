# Bollard Striker Game 🚗💥

![Bollard Strike Logo](./bollard.png)

## 🛑 What's Bollard Striker? 

**Bollard Striker** is your chance to experience what happens when you’re “one of them” who isn’t paying attention and smacks straight into a bollard. Yeah, you know the ones—the short poles that somehow manage to sneak up on you and ruin everyone’s day (especially Security Forces). This game is a tongue-in-cheek look at a super common headache for the SF folks at Wright Pat, so I thought we’d have some fun with it! 🙃

## 🎯 How to Play

- **Avoid** the bollards. (Too easy, right? 😂)
- **Move** left and right using the arrow keys. It’s that simple.
- Try **not to die**. You get 3 chances. Use them wisely.
- Enter your **name** and see how you stack up on the leaderboard. Are you the worst bollard dodger? Or the least worst?

## Why Did I Make This? 

Because *bollard strikes* are a thing. Like, a everyday thing. Drivers hitting those poor defenseless bollards are a Security Forces nightmare. But hey, we thought we’d make it fun and let you see if you can avoid the same fate. Spoiler: You probably can’t. 😉

## 🚗 How to Get Started

### For Web Deployment (Vercel - Recommended)

1. **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/bollard_striker.git
    cd bollard_striker
    ```

2. **Install dependencies**:
    ```bash
    npm install
    ```

3. **Set up Vercel Postgres** (see [DEPLOY.md](./DEPLOY.md) for detailed steps):
    - Create Postgres database in Vercel Dashboard
    - Environment variable `POSTGRES_URL` is set automatically
    - Deploy: `npx vercel --prod`

4. **Quick deploy**:
    ```bash
    npx vercel login
    npx vercel --prod
    ```

See **[DEPLOY.md](./DEPLOY.md)** for complete deployment instructions including database setup.

### For Local Python Development (Legacy)

1. Go into the game folder:
    ```bash
    cd bollard_striker
    ```

2. Set up your virtual environment:
    ```bash
    python -m venv venv
    .venv/scripts/activate 
    ```

3. Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

4. Run the Python version:
    ```bash
    python bollard_striker.py
    ```

## 🎮 Game Features (aka, Why This Game is 🔥)

- **Bollard dodging action** that Security Forces only wish was this fun in real life. Better issue that 1805 and have that report by EOD troop!
- **Leaderboard** to flex your skills (or lack thereof) by entering your name.
- The sweet satisfaction of not hitting them bollards.

## 🤖 Dev Stuff

1. **Pygame** runs this bad boy (because Pygame makes everything better).
2. Files like `visitor.png`, `bollard.png`, and `leaderboard.json` are included, because we got your back.
3. If you break it, it’s probably your fault. 😜 Just kidding, submit a pull request and let’s fix it together.

## 📊 Leaderboard

We keep track of who’s the best at *not* slamming into bollards. At the end of each game, you’ll be asked to input your name so you can cement your legacy (or your eternal shame). Only the greatest—or worst—shall be remembered.

### 🌐 Global Leaderboard Setup

The game now supports a **true global leaderboard** that works across all players! The backend automatically selects the best available option (in priority order):

1. **Vercel Postgres (Native)** - Vercel's native PostgreSQL database ⭐ **Recommended for Vercel deployments**
2. **Supabase** - PostgreSQL database with REST API
3. **Vercel KV** - Redis-based key-value store
4. **Local Storage** - Falls back if no global backend is configured

The frontend will automatically detect and use the global leaderboard when available, showing a status indicator.

#### Option 1: Vercel Postgres Setup (Native - Recommended for Vercel)

1. Install dependencies (if not already installed):
```bash
npm install
```
This will install `@vercel/postgres` as specified in `package.json`.

2. In your Vercel project, go to **Storage** → **Create Database** → **Postgres**
3. Create a new Postgres database
4. Vercel will automatically provide the `POSTGRES_URL` environment variable
5. The table will be created automatically on first use, or you can run this SQL in the Vercel dashboard:
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

6. Deploy or test locally:
```bash
npx vercel dev
```

That's it! The API will automatically use Vercel Postgres when `POSTGRES_URL` is available.

#### Option 2: Supabase Setup

1. Create a free Supabase project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run this to create the leaderboard table:
```sql
create table if not exists public.leaderboard (
  id bigint generated always as identity primary key,
  name text not null,
  score int not null default 0,
  level int not null default 1,
  date timestamp with time zone not null default now()
);

-- Enable public read access
alter table public.leaderboard enable row level security;
create policy "public read" on public.leaderboard for select using (true);
-- Writes are done by service role key in the serverless function
```

3. Get your credentials:
   - Go to Project Settings → API
   - Copy the `Project URL` (e.g., `https://xxxxx.supabase.co`)
   - Copy the `service_role` key (⚠️ Keep this secret!)

4. Set environment variables in Vercel:
   - Go to your Vercel project → Settings → Environment Variables
   - Add:
     - `SUPABASE_URL` = Your project URL
     - `SUPABASE_SERVICE_ROLE_KEY` = Your service role key

5. Deploy or test locally:
```bash
npx vercel dev
```

#### Option 3: Vercel KV Setup (Alternative)

1. In your Vercel project, go to Storage → Create Database → KV
2. Create a new KV database
3. Vercel will automatically provide these environment variables:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
4. The API will automatically use KV if Supabase is not configured

#### Testing the Global Leaderboard

- The leaderboard will show "🌐 Global Leaderboard" when connected
- If unavailable, it shows "📱 Local Leaderboard" as fallback
- Use the "🔄 Refresh" button to reload the latest scores
- Scores are automatically submitted to the global leaderboard when you finish a game

**Note:** The service role key must NEVER be exposed client-side. It's only used in the serverless function at `/api/leaderboard.js`.

#### Vercel Configuration (vercel.json)

The project uses Vercel's native glob patterns to configure the API functions:

```json
{
  "functions": {
    "api/leaderboard.js": {
      "memory": 1024,
      "maxDuration": 10
    },
    "api/**/*.js": {
      "memory": 512,
      "maxDuration": 5
    }
  }
}
```

This configuration:
- Sets specific memory and duration limits for the leaderboard API
- Uses glob patterns (`api/**/*.js`) to apply defaults to all API functions
- Ensures optimal performance for the leaderboard endpoint

You can customize these settings in `vercel.json` based on your needs.

## Requirements

- **Python 3.6+**
- **Pygame 2.x**
- Fingers capable of pressing left and right keys 


## 🙌 Contribute

Feel like making the game even more ridiculous? Fork the repo and send in your meme-worthy improvements. We’re always open to new ways to make bollard dodging hilarious.

---
# bollard_striker
