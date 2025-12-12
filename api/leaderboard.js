// Vercel Serverless Function for a global leaderboard
// Backends (priority order):
// 1) Vercel Postgres (native) if POSTGRES_URL is set
// 2) Supabase (PostgREST) if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
// 3) Vercel KV (Upstash Redis REST) if KV_REST_API_URL and KV_REST_API_TOKEN are set
// 4) Falls back to 501 when not configured (frontend will fall back to localStorage)

const KEY = 'bollard_striker:leaderboard';
const POSTGRES_URL = process.env.POSTGRES_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET;

// Woodpecker's eternal shame - NEVER REMOVE THIS!
const WOODPECKER_ENTRY = { name: 'WOODPECKER', score: -3, level: 1, date: 'Eternal Lore' };

// Vercel Postgres (native) - uses @vercel/postgres package
let sql;
try {
  // Support both CommonJS and ES modules
  const postgres = require('@vercel/postgres');
  sql = postgres.sql || postgres.default?.sql;
} catch (e) {
  // Package not installed, will use other backends
  sql = null;
}

async function kvPipeline(commands) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    return { ok: false, status: 501, data: { error: 'KV not configured' } };
  }
  const resp = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ commands })
  });
  if (!resp.ok) {
    return { ok: false, status: resp.status, data: await resp.json().catch(() => ({})) };
  }
  const data = await resp.json();
  return { ok: true, status: 200, data };
}

async function kvGetLeaderboard() {
  const res = await kvPipeline([["GET", KEY]]);
  if (!res.ok) throw new Error(`KV error ${res.status}`);
  const first = Array.isArray(res.data) ? res.data[0] : undefined;
  const raw = first && (first.result ?? null);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function kvSetLeaderboard(entries) {
  const payload = JSON.stringify(entries);
  const res = await kvPipeline([["SET", KEY, payload]]);
  if (!res.ok) throw new Error(`KV error ${res.status}`);
}

function withLore(entries) {
  const exists = entries.some((e) => (e && String(e.name).toLowerCase() === 'woodpecker'));
  if (exists) return entries;
  return [{ name: 'woodpecker', score: -3, level: 1, date: 'Lore' }, ...entries];
}

function sanitizeEntry({ name, score, level }) {
  const safeName = String(name || 'Anonymous').trim().slice(0, 20) || 'Anonymous';
  const safeScore = Number.isFinite(Number(score)) ? Number(score) : 0;
  const safeLevel = Number.isFinite(Number(level)) ? Number(level) : 1;
  return { name: safeName, score: safeScore, level: safeLevel, date: new Date().toISOString().slice(0, 19).replace('T', ' ') };
}

function normalize(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return withLore(list)
    .filter((e) => e && typeof e.name === 'string' && Number.isFinite(Number(e.score)))
    .slice(0, 100);
}

function mergedTop(entries, newEntry) {
  const merged = [...normalize(entries), newEntry];
  // Deduplicate by name keeping highest score
  const byName = new Map();
  for (const e of merged) {
    const k = String(e.name).toLowerCase();
    if (!byName.has(k) || Number(e.score) > Number(byName.get(k).score)) byName.set(k, e);
  }
  const unique = [...byName.values()].sort((a, b) => Number(b.score) - Number(a.score));
  return unique.slice(0, 25);
}

// Vercel Postgres backend (native)
async function vpFetchRaw(limit = 100) {
  if (!POSTGRES_URL || !sql) throw new Error('Vercel Postgres not configured');
  const result = await sql`
    SELECT name, score, level, date
    FROM leaderboard
    ORDER BY score DESC
    LIMIT ${limit}
  `;
  return Array.isArray(result) ? result : [];
}

async function vpInsert(entry) {
  if (!POSTGRES_URL || !sql) throw new Error('Vercel Postgres not configured');
  const payload = sanitizeEntry(entry);
  // Use INSERT ... ON CONFLICT to update if name exists, keeping highest score
  await sql`
    INSERT INTO leaderboard (name, score, level, date)
    VALUES (${payload.name}, ${payload.score}, ${payload.level}, ${payload.date})
    ON CONFLICT (name) DO UPDATE
    SET 
      score = GREATEST(leaderboard.score, ${payload.score}),
      level = GREATEST(leaderboard.level, ${payload.level}),
      date = CASE 
        WHEN ${payload.score} > leaderboard.score THEN ${payload.date}
        ELSE leaderboard.date
      END
  `;
}

async function vpInitTable() {
  if (!POSTGRES_URL || !sql) return;
  try {
    // Create table with unique constraint on name
    await sql`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        score INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `;
    // Create index separately (may fail if exists, that's ok)
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC)`;
    } catch (e) {
      // Index might already exist, ignore
    }
  } catch (e) {
    // Table might already exist or other error, ignore
    console.warn('Table init warning:', e.message);
  }
}

// Supabase backend (via PostgREST)
async function sbFetchRaw(limit = 100) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SB not configured');
  const url = `${SUPABASE_URL}/rest/v1/leaderboard?select=*&order=score.desc&limit=${encodeURIComponent(String(limit))}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=none'
    }
  });
  if (!resp.ok) throw new Error(`SB fetch error ${resp.status}`);
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

async function sbInsert(entry) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SB not configured');
  const url = `${SUPABASE_URL}/rest/v1/leaderboard`;
  const payload = sanitizeEntry(entry);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error(`SB insert error ${resp.status}`);
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      // Priority 1: Vercel Postgres (native)
      if (POSTGRES_URL && sql) {
        try {
          await vpInitTable(); // Ensure table exists
          const raw = await vpFetchRaw(100);
          const entries = normalize(raw).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 25);
          return res.status(200).end(JSON.stringify({ entries, source: 'vercel-postgres' }));
        } catch (e) {
          console.error('Vercel Postgres fetch error:', e);
          // Fall through to Supabase
        }
      }

      // Priority 2: Supabase
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const raw = await sbFetchRaw(100);
          const entries = normalize(raw).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 25);
          return res.status(200).end(JSON.stringify({ entries, source: 'supabase' }));
        } catch (e) {
          console.error('Supabase fetch error:', e);
          // Fall through to KV
        }
      }

      // Priority 3: Vercel KV
      try {
        const entriesRaw = await kvGetLeaderboard();
        const entries = normalize(entriesRaw);
        try { await kvSetLeaderboard(entries); } catch {}
        return res.status(200).end(JSON.stringify({ entries, source: 'kv' }));
      } catch (e) {
        console.error('KV fetch error:', e);
        // Return empty with 501 to indicate not configured
        return res.status(501).end(JSON.stringify({ error: 'Leaderboard not configured', entries: [] }));
      }
    }

    if (req.method === 'POST') {
      const body = await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); }
        });
        req.on('error', reject);
      });
      const entry = sanitizeEntry(body || {});
      
      // Priority 1: Vercel Postgres (native)
      if (POSTGRES_URL && sql) {
        try {
          await vpInitTable(); // Ensure table exists
          await vpInsert(entry);
          const raw = await vpFetchRaw(100);
          const top = normalize(raw);
          const unique = mergedTop(top, WOODPECKER_ENTRY); // ensure lore in list
          return res.status(200).end(JSON.stringify({ entries: unique, source: 'vercel-postgres' }));
        } catch (e) {
          console.error('Vercel Postgres insert error:', e);
          // Fall through to Supabase
        }
      }

      // Priority 2: Supabase
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
          await sbInsert(entry);
          // Fetch raw top, then de-duplicate by name keeping highest
          const raw = await sbFetchRaw(100);
          const top = normalize(raw);
          const unique = mergedTop(top, WOODPECKER_ENTRY); // ensure lore in list
          return res.status(200).end(JSON.stringify({ entries: unique, source: 'supabase' }));
        } catch (e) {
          console.error('Supabase insert error:', e);
          // Fall through to KV
        }
      }

      // Priority 3: Vercel KV
      try {
        const current = normalize(await kvGetLeaderboard().catch(() => []));
        const next = mergedTop(current, entry);
        await kvSetLeaderboard(next);
        return res.status(200).end(JSON.stringify({ entries: next, source: 'kv' }));
      } catch (e) {
        console.error('KV insert error:', e);
        return res.status(501).end(JSON.stringify({ error: 'Leaderboard not configured', entries: [] }));
      }
    }

    return res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (e) {
    // If KV not configured or other error, indicate not available so client can fallback
    const message = (e && e.message) || 'Internal error';
    const code = /KV error 501/.test(message) ? 501 : 500;
    return res.status(code).end(JSON.stringify({ error: message }));
  }
};


