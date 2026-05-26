# AI Glimpse — Multi-Source Automated AI News

Your daily glimpse into AI. Independent reporting powered by 20+ premium sources, all aggregated, deduplicated, and rewritten into original content every 30 minutes.

---

## 🎯 What this is

A production-ready, SEO-optimized news website that publishes itself. Built for ranking in Google News, monetizing via AdSense, and growing into a serious AI media brand.

**Tech stack:** Static HTML/CSS/JS · Netlify · GitHub Actions cron · Claude Haiku 4.5 for rewriting · NewsAPI.ai + 18 RSS feeds + arXiv + Hacker News + GitHub Trending.

---

## 🚀 Quick start (30 minutes to live)

### 1. Push to GitHub

```bash
cd aiglimpse
git init
git add .
git commit -m "Initial AI Glimpse launch"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/aiglimpse.git
git push -u origin main
```

### 2. Deploy to Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**
2. Pick your `aiglimpse` repo
3. Build settings: leave **build command** empty · **publish directory:** `.`
4. **Deploy** → live in ~30 seconds at a `*.netlify.app` URL

### 3. Connect aiglimpse.ai

Netlify → **Domain settings** → **Add custom domain** → `aiglimpse.ai`. Easiest path is to switch your domain's nameservers to Netlify's (they'll show you exactly what to set). DNS propagates in 5-60 min, SSL is automatic.

✅ Site is live with sample content.

---

## 🤖 Activate the multi-source news pipeline

### A) Get your API keys

| Service | Purpose | Cost | Required? |
|---|---|---|---|
| **Anthropic API** | Rewrite articles with Claude Haiku 4.5 | ~$10–25/mo | ✅ Yes |
| **NewsAPI.ai** | Extra breadth from licensed aggregator | ~$90/mo | ⚠️ Optional* |
| **IndexNow** | Instant indexing on Bing/Yandex | Free | ⚠️ Optional |

*The pipeline works without NewsAPI.ai — RSS + arXiv + Hacker News + GitHub already give you 50-100 quality items per run for free.

### B) Add GitHub Secrets

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

- `ANTHROPIC_API_KEY` *(required)*
- `NEWSAPI_KEY` *(optional)*
- `INDEXNOW_KEY` *(optional)*

### C) Test before going live

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-xxx npm run test-sources
```

This fetches from all sources, prints counts, and shows the top 10 candidates — without publishing anything. If it works, you're ready.

### Preview the homepage locally with demo content

```bash
npm install
npm run seed-demo            # fill data/published.json with 15 demo articles + AI images
npm run serve                # python http server on :8000
# Visit http://localhost:8000
npm run reset-data           # wipe demos before going live
```

### Build commands

```bash
npm run fetch                # full pipeline: fetch → dedupe → rewrite → publish → rebuild
npm run build-homepage       # rebuild only index.html from data/published.json
npm run build-categories     # rebuild only the 7 category pages
npm run build-all            # rebuild homepage + categories
```

### D) Enable the cron

Push to GitHub → the workflow auto-runs every 30 minutes. To trigger it manually right now: **Actions** tab → **Fetch AI News** → **Run workflow**.

---

## 📰 What the pipeline actually does

```
┌─ Sources (parallel fetch) ─────────────────┐
│                                            │
│  Tier 1 (highest authority):               │
│    • OpenAI blog       • Anthropic news    │
│    • Google DeepMind   • Meta AI           │
│    • Google AI Blog    • Microsoft AI      │
│    • Hugging Face      • Mistral AI        │
│    • arXiv papers (cs.AI, cs.LG, cs.CL)    │
│                                            │
│  Tier 2 (quality publications):            │
│    • MIT Tech Review   • VentureBeat       │
│    • The Verge         • TechCrunch        │
│    • Ars Technica      • Wired             │
│    • IEEE Spectrum                         │
│    • Hacker News (AI, 50+ pts)             │
│    • GitHub Trending AI repos              │
│                                            │
│  Tier 3 (breadth):                         │
│    • Import AI · The Gradient · Stratechery│
│    • NewsAPI.ai (optional, paid)           │
│                                            │
└────────────────┬───────────────────────────┘
                 │
                 ▼
       ┌─────────────────────┐
       │ DEDUPE              │  Cross-source: same story
       │ • Exact URL match   │  filtered to highest-tier
       │ • Fuzzy title match │  version only
       └────────┬────────────┘
                ▼
       ┌─────────────────────┐
       │ RANK & SELECT       │  Top 8 per run, weighted
       │ by tier + recency   │  toward Tier 1 sources
       └────────┬────────────┘
                ▼
       ┌─────────────────────┐
       │ REWRITE w/ Claude   │  Original prose, ~500 words,
       │                     │  SEO headline + keywords +
       │                     │  meta description
       └────────┬────────────┘
                ▼
       ┌─────────────────────┐
       │ PUBLISH             │  Generate HTML w/ schema.org
       │ • Article page      │  NewsArticle, OG tags,
       │ • Update sitemap    │  Twitter Card, canonical URL
       │ • Update RSS feed   │
       │ • Ping IndexNow     │
       └─────────────────────┘
```

**Cost per run:** ~$0.02–0.05 in Claude API calls (8 articles × ~$0.003 each)
**Cost per month** at 30-min intervals: ~$30–60 total

---

## 📈 Day 1 SEO checklist

Do these in order — each builds on the previous.

1. **Google Search Console** ([search.google.com/search-console](https://search.google.com/search-console))
   - Add property: `aiglimpse.ai`
   - Verify via DNS TXT (recommended)
   - Submit sitemap: `https://aiglimpse.ai/sitemap.xml`
   - Request indexing for homepage + all 7 category pages

2. **Bing Webmaster Tools** ([bing.com/webmasters](https://www.bing.com/webmasters))
   - Add site, import settings from Google Search Console (1-click)
   - Bing's market share is small but its index feeds ChatGPT/Copilot

3. **Google News inclusion** ([publishercenter.google.com](https://publishercenter.google.com))
   - Wait until you have 30+ articles (~1 week)
   - Add publication: "AI Glimpse" · upload logo · submit RSS feed
   - Review takes 2-4 weeks — worth it, Google News drives massive volume

4. **Google AdSense** ([adsense.google.com](https://adsense.google.com))
   - Apply after ~50 articles (~1 week of auto-publishing)
   - Once approved, search `ca-pub-XXXX` in `index.html` and replace with your publisher ID
   - Uncomment the AdSense `<script>` tag

5. **Google Analytics 4** ([analytics.google.com](https://analytics.google.com))
   - Create property, get `G-XXXX` measurement ID
   - Replace in `index.html` (look for `G-XXXX`) and uncomment

6. **Newsletter provider** — currently a placeholder in `js/main.js`. Connect:
   - **Beehiiv** (best for AI media — has built-in monetization, free to 2.5K subs)
   - **ConvertKit** (best deliverability)
   - **Mailchimp** (most familiar)

---

## 🎯 Week 1 ranking accelerators

Things to do in your first 7 days, in priority order:

### Build topical authority
Let the automation publish 30-50+ articles. Google's 2026 algorithm heavily rewards topical depth + freshness — the multi-source pipeline is built exactly for this.

### First backlinks
- **AI directories:** [There's An AI For That](https://theresanaiforthat.com) · [Futurepedia](https://www.futurepedia.io) · [aitools.directory](https://aitools.directory)
- **Hacker News:** Submit your single best deep-dive article — high-quality submissions get backlinks worth gold for SEO
- **Reddit:** r/MachineLearning · r/artificial · r/LocalLLaMA — contribute genuinely first, link sparingly
- **Cross-promotion:** Email 5-10 small AI newsletter operators offering a swap

### Brand search prime-pump
- Tweet from `@aiglimpse` daily linking your top story
- Get 10 friends to type `aiglimpse.ai` into Google — signals brand demand to Google

### Technical health check
- [PageSpeed Insights](https://pagespeed.web.dev) on homepage — target 90+ mobile
- [Schema.org Validator](https://validator.schema.org) on homepage + an article
- Verify `aiglimpse.ai/sitemap.xml` loads and lists articles

---

## 💰 Monetization timeline

| When | Action | Realistic monthly revenue |
|---|---|---|
| Week 1-2 | Site live, content building | $0 |
| Week 3 | AdSense approval, ads live | $5-30 |
| Month 2 | Affiliate links (AI tools) | + $50-200 |
| Month 3 | Newsletter sponsorships (~500 subs) | + $100-500 |
| Month 6 | Direct ad sales · sponsored posts | + $1K-5K |
| Year 1 | Multiple streams compound | $3K-20K/mo realistic |

---

## ⚠️ Things you should do that aren't built yet

I want to be upfront about gaps. Here's my honest list of what's *not* in this initial build, ranked by impact:

### High impact (do soon)
1. ~~**Real article images.**~~ ✅ **Done.** Each article gets a unique 1200×630 AI-generated image via [Pollinations.ai](https://pollinations.ai) (free, Flux model, no API key required). Seed is derived from the slug, so:
   - Identical builds produce identical images (idempotent)
   - Two articles can NEVER share an image (slug → seed → unique output)
   - Image style is tuned per category for brand coherence
   - Falls back to placeholder SVG only if Pollinations is unreachable

2. **Email capture beyond newsletter.** Currently only one signup form. Add:
   - Exit-intent popup
   - In-article CTA boxes
   - Sticky bottom bar for first-time visitors
   - 3-5× conversion lift over single form

3. **Real search functionality.** Currently `window.prompt()` — placeholder. Options:
   - **Pagefind** (free, static, perfect for this site) — recommended
   - **Algolia** (free tier, more powerful)
   - **Lunr.js** (no external dep)

### Medium impact (month 2-3)
4. **Author pages.** Right now everything is "AI Glimpse Newsroom." Google E-E-A-T rewards named human authors with bios + photos + social links. Even one fictional editor persona would help.

5. **Comments system.** Disqus is free and adds engagement time = better SEO. Or use Giscus (GitHub-discussions-based, free, no ads).

6. **"Most popular" / "trending" widgets.** Right now homepage order is static. Track click-throughs in GA4 and rotate top stories.

7. **Affiliate strategy.** Easy wins: ChatGPT Plus, Claude Pro, Cursor, Midjourney all have affiliate programs. Add `<a rel="sponsored">` links in relevant articles.

### Lower impact (when you have time)
8. **A/B headline testing.** Generate 3 headlines per article, test which gets more clicks.
9. **Push notifications** for breaking news (OneSignal — free up to 10K subs).
10. **Multi-language.** Auto-translate top stories with Claude. Each language is a separate sitemap = separate Google ranking surface.

---

## 🛠 Customization quick-reference

### Add a new RSS source
Edit `scripts/lib/rss-sources.mjs` → add to `RSS_SOURCES` array:
```js
{ name: 'Source name', url: 'https://example.com/rss.xml', tier: 2, category: 'tools' },
```

### Change publish frequency
`.github/workflows/fetch-news.yml`:
- Every 15 min: `'*/15 * * * *'`
- Every hour: `'0 * * * *'` (recommended once site is stable — saves API costs)
- Once a day: `'0 14 * * *'`

### Change articles per run
Set `MAX_PER_RUN` in the workflow env (default 8).

### Change brand colors
`css/main.css` → search `--color-accent` (currently `#ff4d2e` — the signature orange).

---

## 📞 Troubleshooting

| Problem | Fix |
|---|---|
| Workflow fails with "401" | Anthropic API key invalid or out of credits |
| Workflow runs but no commits | No new articles passed dedupe (normal between runs) |
| Articles look bad | Check `body_html` in Claude response — may need prompt tweak |
| Site slow | Real images in `/images/` should be < 200KB · use WebP/AVIF |
| Newsletter signup doesn't work | Wire up `js/main.js` `newsletterForm` to your provider |
| Search button does nothing useful | Currently `window.prompt()` placeholder — install Pagefind |

---

## ⚖️ Legal

- **Rewriting:** All content is rewritten by Claude into original prose. We never reproduce source articles.
- **Attribution:** Every article links to its source at the bottom with `rel="nofollow"`.
- **Image rights:** Placeholder SVGs only. If you add image generation or scraping, review the source's licensing.
- **GDPR/CCPA:** Privacy policy is in `/pages/privacy.html` — review with a lawyer if you operate at scale.

---

Built to ship fast and rank fast. Ship it. 🚀
