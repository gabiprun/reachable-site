# reachable-site

The public website for **Reachable** (Reachable Access Society, incorporation in
progress, Victoria BC). Live at https://reachable.prundaru.ca until
reachablesociety.ca is registered.

Plain HTML, one shared stylesheet, two small scripts. **No build step, no
framework, no third-party code.** Open any `.html` file in a browser and it works.
Everything on it also works with JavaScript turned off.

## Files

| File | What it is |
|---|---|
| `index.html` | Home: mission, the four programs, call now |
| `line.html` `number.html` `benefits.html` `tech.html` | One page per program: who it's for / what you get / how to start / what we will never do, plus an intake form |
| `about.html` `volunteer.html` `donate.html` | Society, founder, board seats · volunteer roles + form · honest donate page |
| `privacy.html` `accessibility.html` | PIPA privacy page · accessibility statement |
| `site-config.js` | **The one place phone numbers, the email address and the backend URL live** |
| `benefits.json` | The benefits finder's data. **Generated**, do not hand-edit (see below) |
| `assets/site.css` | All styles. Colours, sizes and focus rings are documented at the top |
| `assets/site.js` | Larger-text toggle, mobile menu, number fill-in, form sender |
| `assets/benefits.js` | The benefits finder (screener) on `benefits.html` |
| `assets/og.svg` `favicon.svg` | Social preview image and icon |
| `tools/sync_numbers.py` | Copies numbers/email from `site-config.js` into the HTML (for no-JavaScript visitors) |
| `tools/check_site.py` | Pre-push checks: unclosed tags, one h1, broken links, missing labels |
| `CNAME` `.nojekyll` `robots.txt` `sitemap.xml` | GitHub Pages plumbing |

## Where the phone numbers live

`site-config.js`, and nowhere else. Until the real numbers are assigned in the
BulkVS portal they are the placeholder `(250) 000-0000` with `numbersReady: false`,
which makes every page say "number coming soon" and *not* turn them into
tap-to-call links. Never type a real-looking number anywhere as a placeholder.

To go live:

1. Put the real numbers in `site-config.js` and set `numbersReady: true`.
2. Run `python3 tools/sync_numbers.py` so the plain-HTML copies match
   (visitors without JavaScript see those).
3. `python3 tools/check_site.py`, then commit and push.

`python3 tools/sync_numbers.py --check` tells you if the pages and the config
have drifted apart. Set `office` to a number to show an office line, or leave it
`''` to hide it.

## How the forms work

Each form has `data-intake="<program>"` where program is one of
`line | number | benefits | tech | volunteer`. Field names match the backend
models in `reachable/reachable/intake.py`.

- `apiBase` empty in `site-config.js` (today): the form builds a `mailto:` link
  to `email` with the answers in the body and opens the visitor's email app. It
  also shows the text so they can copy it if nothing opened.
- `apiBase` set (for example `https://reachable-api.prundaru.ca`): the form POSTs
  JSON to `apiBase + /api/intake/<program>`. On a network error it falls back to
  the email link. The backend must list `https://reachable.prundaru.ca` in its
  `cors_origins`.
- With JavaScript off, the form's own `action="mailto:…"` does the same job.
- The hidden field named `website` is a honeypot: people never see it, bots fill
  it, and both the page and the backend silently drop those.

## The benefits finder

`benefits.html` loads `./benefits.json` and runs the screener in the browser
(rules per DESIGN.md §8b: a rule matches when every answer in `when` is one of
the person's answers; programs are ordered by number of matching rules, then
name; `requires` shows "First you need: …" unless `has_<key>` was answered
"yes"). Nothing is sent anywhere.

`benefits.json` is produced by `reachable/tools/build_benefits_json.py` from the
knowledge base in `reachable/kb/`. Regenerate it there; do not edit it here. The
site depends only on the schema, not on which programs are in it.

## How to edit

- Edit the HTML directly. Keep plain language (the audience includes seniors
  and people with cognitive disabilities): short sentences, no jargon, say
  "phone number" not "DID".
- Keep **one `<h1>` per page** and keep the "Call us" block at the end.
- The header, nav, "Call us" block and footer are the same on every page and
  are marked `<!-- shared: … -->` … `<!-- /shared: … -->`. When you change
  one, change it in all ten files (find and replace works; there is no
  template engine on purpose).
- Adding a page: copy an existing one, change `<title>`, description,
  canonical URL and `aria-current` in the nav, add it to `sitemap.xml`.
- The mission statement is quoted from `reachable/DESIGN.md` and must stay
  word for word; `tools/check_site.py` fails if it drifts.
- Accessibility rules that must survive every edit: 18px base text, body text
  contrast ≥ 7:1, buttons ≥ 4.5:1, every target ≥ 44px, visible focus, no
  motion, no autoplay, no carousels, labels on every field, `tel:` links for
  live numbers.

## Preview locally

```
cd "reachable-site"
python3 -m http.server 8391
# open http://localhost:8391/
```

Check before pushing: `python3 tools/check_site.py && python3 tools/sync_numbers.py --check`.

## Deploy

GitHub Pages serves the `main` branch from the repository root, so deploying
is `git push origin main`. `CNAME` holds `reachable.prundaru.ca`; the matching
DNS record is a CNAME at Cloudflare pointing that host at the GitHub Pages
hostname of the account that owns the repo (for example `gabiprun.github.io`),
with GitHub Pages "Enforce HTTPS" on. `.nojekyll` stops GitHub from running
Jekyll over the files.

Per DESIGN.md the site is only pushed when Gabriel says so.

## Not done yet

- `assets/og.svg` is an SVG; most social networks want a PNG or JPEG for
  `og:image`. Export it to `assets/og.png` (1200×630) and change the
  `og:image` meta tag on each page when convenient.
- `privacy.html` promises to name the AI providers and the recording retention
  period before the Line opens. Fill those in from `reachable/docs/policies/`.
