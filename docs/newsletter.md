# AI Glimpse Daily (Resend)

Newsletter signup uses **double opt-in** via Cloudflare Pages Functions + **Resend** for delivery.

## Same API key as ev-marketing?

**Yes, usually.** One Resend account can send for multiple verified domains.

| Setting | ev-marketing.com | aiglimpse.ai |
|---|---|---|
| `RESEND_API_KEY` | Same key (if one Resend account) | Same key |
| `RESEND_FROM_EMAIL` | `EV Marketing <...>` | `AI Glimpse <daily@aiglimpse.ai>` |
| `RESEND_AUDIENCE_ID` | Separate audience | **Create new** — see below |
| `NEWSLETTER_SECRET` | Your existing secret | **Use a new secret** (recommended) |

Both sending domains must be **verified in Resend** (DNS records on each domain).

## One-time setup

### 1. Verify `aiglimpse.ai` in Resend

Resend dashboard → Domains → Add `aiglimpse.ai` → add DNS records Cloudflare already hosts.

Suggested from address: `AI Glimpse <daily@aiglimpse.ai>`

### 2. Create subscriber audience

```bash
RESEND_API_KEY=re_xxx node scripts/setup-resend-audience.mjs
```

Copy the printed `RESEND_AUDIENCE_ID`.

### 3. Cloudflare Pages env vars (`aiglimpse` project)

| Variable | Example |
|---|---|
| `RESEND_API_KEY` | `re_...` |
| `RESEND_FROM_EMAIL` | `AI Glimpse <daily@aiglimpse.ai>` |
| `RESEND_AUDIENCE_ID` | `aud_...` |
| `NEWSLETTER_SECRET` | `openssl rand -hex 32` |

Redeploy after saving.

### 4. GitHub Actions secrets (daily send workflow)

| Secret | Notes |
|---|---|
| `RESEND_API_KEY` | Same as Cloudflare |
| `RESEND_FROM_EMAIL` | `AI Glimpse <daily@aiglimpse.ai>` |
| `RESEND_SEGMENT_ID` | From `node scripts/setup-resend-segment.mjs` (preferred) |
| `RESEND_AUDIENCE_ID` | Legacy alias — still accepted |

Add via GitHub → **Settings → Secrets and variables → Actions → New repository secret**.

```bash
# Print segment id after creating in Resend
RESEND_API_KEY=re_xxx node scripts/setup-resend-segment.mjs
```

## Flow

1. User submits email → `POST /api/newsletter/subscribe`
2. Resend sends confirmation link
3. User clicks → `GET /api/newsletter/verify` → contact added to audience + welcome email
4. **07:00 UTC daily** → `send-daily-newsletter.mjs` → Resend Broadcast to audience

## Manual test

```bash
# Subscribe (after deploy + env vars)
curl -X POST https://aiglimpse.ai/api/newsletter/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'

# Force send digest (GitHub Actions → Send AI Glimpse Daily newsletter → Run workflow)
```

## Files

- `functions/api/newsletter/subscribe.js` — confirmation email
- `functions/api/newsletter/verify.js` — add to audience
- `functions/api/newsletter/unsubscribe.js` — remove contact
- `scripts/send-daily-newsletter.mjs` — daily digest
- `.github/workflows/newsletter-daily.yml` — cron
