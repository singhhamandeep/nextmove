/**
 * NextMove — Claude API Proxy
 * Vercel Serverless Function (CommonJS — maximum compatibility)
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_CALLS     = parseInt(process.env.RATE_LIMIT_MAX    || "20");
const WINDOW_MS     = parseInt(process.env.RATE_LIMIT_WINDOW || "3600000");

const ipStore = new Map();

function getIP(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers["x-real-ip"] || "unknown";
}

function checkRate(ip) {
  const now   = Date.now();
  const entry = ipStore.get(ip) || { count: 0, start: now };
  if (now - entry.start > WINDOW_MS) { entry.count = 0; entry.start = now; }
  entry.count++;
  ipStore.set(ip, entry);
  return {
    ok:      entry.count <= MAX_CALLS,
    left:    Math.max(0, MAX_CALLS - entry.count),
    resetIn: Math.ceil((WINDOW_MS - (now - entry.start)) / 60000),
  };
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "POST only" });

  // Rate limit
  const rate = checkRate(getIP(req));
  if (!rate.ok) {
    return res.status(429).json({
      error: `Rate limit: ${MAX_CALLS} calls/hour. Resets in ${rate.resetIn} min.`
    });
  }

  // Parse body — handle both string and object
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch (e) { return res.status(400).json({ error: "Invalid JSON body" }); }
  }
  if (!body) {
    return res.status(400).json({ error: "Empty request body" });
  }

  // Safety overrides
  body.model      = "claude-haiku-4-5-20251001";
  body.max_tokens = Math.min(body.max_tokens || 500, 1000);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.length < 10) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set on server" });
  }

  // Forward to Anthropic
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    let data = {};
    try { data = await upstream.json(); } catch (_) {}

    if (!upstream.ok) {
      console.error("[proxy] Anthropic error", upstream.status, JSON.stringify(data));
      return res.status(upstream.status).json({
        error: (data.error && data.error.message) || ("Anthropic error: " + upstream.status),
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error("[proxy] Fetch failed:", err.message);
    return res.status(500).json({ error: "Proxy failed: " + err.message });
  }
};
