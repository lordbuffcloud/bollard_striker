// Vercel Serverless Function for a global leaderboard
// Backends (priority order):
// 1) Supabase (PostgREST) if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
// 2) Vercel KV (Upstash Redis REST) if KV_REST_API_URL and KV_REST_API_TOKEN are set
// 3) Falls back to 501 when not configured (frontend will fall back to localStorage)

const KEY = 'bollard_striker:leaderboard';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET;

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
      // Prefer Supabase if configured
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const raw = await sbFetchRaw(100);
        const entries = normalize(raw).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 25);
        return res.status(200).end(JSON.stringify({ entries }));
      }

      // Fallback to KV
      const entriesRaw = await kvGetLeaderboard(); // allow error to throw
      const entries = normalize(entriesRaw);
      try { await kvSetLeaderboard(entries); } catch {}
      return res.status(200).end(JSON.stringify({ entries }));
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
      // Prefer Supabase if configured
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        await sbInsert(entry);
        // Fetch raw top, then de-duplicate by name keeping highest
        const raw = await sbFetchRaw(100);
        const top = normalize(raw);
        const unique = mergedTop(top, WOODPECKER_ENTRY); // ensure lore in list
        return res.status(200).end(JSON.stringify({ entries: unique }));
      }

      // Fallback to KV
      const current = normalize(await kvGetLeaderboard().catch(() => []));
      const next = mergedTop(current, entry);
      await kvSetLeaderboard(next);
      return res.status(200).end(JSON.stringify({ entries: next }));
    }

    return res.status(405).end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (e) {
    // If KV not configured or other error, indicate not available so client can fallback
    const message = (e && e.message) || 'Internal error';
    const code = /KV error 501/.test(message) ? 501 : 500;
    return res.status(code).end(JSON.stringify({ error: message }));
  }
};


