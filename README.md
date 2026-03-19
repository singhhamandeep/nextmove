# NextMove — Deploy to Vercel

> "Not lazy. Just stuck." — AI-powered goal tracker that gives you ONE next action.

---

## Project structure

```
nextmove/
├── api/
│   └── claude.js        ← Serverless proxy (holds your API key, rate limits users)
├── public/
│   └── index.html       ← The full web app
├── vercel.json          ← Vercel routing config
├── package.json
├── .env.example         ← Copy to .env.local and fill in your key
└── .gitignore
```

---

## Deploy in 5 steps

### 1. Get your Anthropic API key
Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key.
Copy the `sk-ant-api03-...` key.

### 2. Push to GitHub
```bash
git init
git add .
git commit -m "Initial NextMove deploy"
gh repo create nextmove --public --push
# or push to your existing GitHub repo
```

### 3. Connect to Vercel
- Go to [vercel.com](https://vercel.com) and sign in
- Click **Add New Project** → Import your GitHub repo
- Framework: **Other** (no framework needed)

### 4. Add your environment variables
In Vercel → Your project → **Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-your-key-here` |
| `RATE_LIMIT_MAX` | `20` (AI calls per user per hour) |
| `RATE_LIMIT_WINDOW` | `3600000` (1 hour in ms) |
| `ALLOWED_ORIGIN` | `https://your-app.vercel.app` (your deployed URL) |

### 5. Deploy
Click **Deploy**. Vercel builds and deploys in ~30 seconds.
Your app is live at `https://nextmove-xxx.vercel.app` (or your custom domain).

---

## How the proxy works

```
User's browser  →  /api/claude  →  Anthropic API
                   (your server)    (your key, hidden)
```

- Your Anthropic key **never touches the browser** — it lives only on Vercel's server
- Each IP address gets **20 AI calls per hour** by default (configurable)
- If someone hits the limit they get a friendly message, not an error
- The proxy only forwards requests to `claude-sonnet-4-20250514` and caps tokens at 1000

---

## Rate limit tuning

Edit `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW` in your Vercel environment variables:

| Use case | MAX | WINDOW |
|----------|-----|--------|
| Personal use | 100 | 3600000 (1hr) |
| Small public app | 20 | 3600000 (1hr) |
| Very conservative | 10 | 86400000 (24hr) |

---

## Local development

```bash
npm install
cp .env.example .env.local
# fill in your key in .env.local
npm run dev
# open http://localhost:3000
```

---

## Estimated costs

Claude Sonnet 4 pricing (as of early 2025):
- Input: ~$3 per million tokens
- Output: ~$15 per million tokens

Each NextMove AI call uses ~200–400 tokens total.
At 20 calls/user/hour with 100 daily active users:
**~$0.50–2.00/day** at full load — extremely cheap.

---

## Tech stack

- **Frontend**: Vanilla HTML/CSS/JS — zero dependencies, zero build step
- **Backend**: Vercel Serverless Function (Node.js)
- **AI**: Anthropic Claude (claude-sonnet-4-20250514)
- **Storage**: Browser localStorage — no database needed

---

© 2025 NextMove. All rights reserved.
