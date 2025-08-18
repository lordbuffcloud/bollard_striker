// Vercel Serverless Function for a global leaderboard
// Uses Vercel KV (Upstash Redis REST) if KV_REST_API_URL and KV_REST_API_TOKEN are set
// Falls back to 501 when not configured (frontend will fall back to localStorage)

const KEY = 'bollard_striker:leaderboard';

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
    body: JSON.stringify(commands)
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
  const [[, raw]] = res.data; // pipeline returns array of [statusCode, result]
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

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const entries = normalize(await kvGetLeaderboard().catch(() => []));
      // Ensure lore is persisted if KV configured
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


