/**
 * NextMove — Claude API Proxy
 * Vercel Serverless Function
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_CALLS     = parseInt(process.env.RATE_LIMIT_MAX    || "20");
const WINDOW_MS     = parseInt(process.env.RATE_LIMIT_WINDOW || "3600000");

// Tell Vercel to parse the request body automatically
export const config = {
  api: { bodyParser: true }
};

const ipStore = new Map();

function getIP(req) {
  return (
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    "unknown"
  );
}

function checkRateLimit(ip) {
  const now   = Date.now();
  const entry = ipStore.get(ip) || { count: 0, start: now };
  if (now - entry.start > WINDOW_MS) { entry.count = 0; entry.start = now; }
  entry.count++;
  ipStore.set(ip, entry);
  return {
    allowed:   entry.count <= MAX_CALLS,
    remaining: Math.max(0, MAX_CALLS - entry.count),
    resetIn:   Math.ceil((WINDOW_MS - (now - entry.start)) / 60000),
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin",  allowed === "*" ? "*" : origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  // Rate limit
  const ip    = getIP(req);
  const limit = checkRateLimit(ip);
  res.setHeader("X-RateLimit-Remaining", limit.remaining);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Rate limit reached (${MAX_CALLS} calls/hour). Resets in ~${limit.resetIn} min.`
    });
  }

  // Parse body
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }
  if (!body || !body.messages) {
    return res.status(400).json({ error: "Missing messages in request body" });
  }

  // Force safe values — use the latest stable model
  body.model      = "claude-haiku-4-5-20251001";
  body.max_tokens = Math.min(body.max_tokens || 500, 1000);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    let data;
    try { data = await upstream.json(); } catch { data = {}; }

    if (!upstream.ok) {
      console.error("Anthropic error:", upstream.status, JSON.stringify(data));
      return res.status(upstream.status).json({
        error: (data.error && data.error.message) || "Anthropic API error: " + upstream.status,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Proxy fetch error:", err.message);
    return res.status(500).json({ error: "Proxy request failed: " + err.message });
  }
}
