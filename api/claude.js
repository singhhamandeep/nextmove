/**
 * NextMove — Claude API Proxy
 * Vercel Serverless Function
 *
 * Hides your Anthropic key server-side.
 * Rate limits: MAX_CALLS_PER_IP per IP per window (default 20/hour).
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_CALLS     = parseInt(process.env.RATE_LIMIT_MAX  || "20");   // calls per window
const WINDOW_MS     = parseInt(process.env.RATE_LIMIT_WINDOW || "3600000"); // 1 hour

// In-memory store — resets on cold start, good enough for rate limiting abuse
// For production scale swap with Vercel KV / Redis
const ipStore = new Map();

function getIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function checkRateLimit(ip) {
  const now  = Date.now();
  const entry = ipStore.get(ip) || { count: 0, start: now };

  // reset window if expired
  if (now - entry.start > WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }

  entry.count++;
  ipStore.set(ip, entry);

  return {
    allowed:   entry.count <= MAX_CALLS,
    remaining: Math.max(0, MAX_CALLS - entry.count),
    resetIn:   Math.ceil((WINDOW_MS - (now - entry.start)) / 1000 / 60), // minutes
  };
}

export default async function handler(req, res) {
  // CORS — allow your deployed domain and localhost dev
  const allowed = [
    process.env.ALLOWED_ORIGIN || "*",
    "http://localhost:3000",
    "http://localhost:5500",
  ];
  const origin = req.headers.origin || "";
  const corsOrigin =
    process.env.ALLOWED_ORIGIN === "*" || allowed.includes(origin)
      ? origin || "*"
      : process.env.ALLOWED_ORIGIN;

  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  // Rate limit
  const ip     = getIP(req);
  const limit  = checkRateLimit(ip);

  res.setHeader("X-RateLimit-Remaining", limit.remaining);
  res.setHeader("X-RateLimit-Reset-In",  limit.resetIn + "min");

  if (!limit.allowed) {
    return res.status(429).json({
      error: `Rate limit reached. You've used ${MAX_CALLS} AI calls this hour. Resets in ~${limit.resetIn} min.`,
      retryAfter: limit.resetIn,
    });
  }

  // Validate body
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  // Safety: only allow our model, cap tokens
  body.model      = "claude-sonnet-4-20250514";
  body.max_tokens = Math.min(body.max_tokens || 500, 1000);

  // Call Anthropic
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || "Anthropic API error",
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Proxy request failed" });
  }
}
