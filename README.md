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
| `guides/` | The Guides section: `index.html` (library), `start-here.html` (the hub), one file per guide, and the generated `feed.xml` |
| `assets/guides.css` `assets/guides.js` | Styles for guide pages · the search and topic filter on the guides index |
| `assets/og.svg` `favicon.svg` | Social preview image and icon |
| `tools/sync_numbers.py` | Copies numbers/email from `site-config.js` into the HTML (for no-JavaScript visitors) |
| `tools/check_site.py` | Pre-push checks: unclosed tags, one h1, broken links, missing labels |
| `tools/build_guides.py` | Builds the guides index, `guides/feed.xml` and the sitemap's guide entries from the guide pages |
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

## The guides

`guides/` holds the plain-language guides. They are ordinary HTML pages built on
the same skeleton as everything else — copy `guides/rdsp.html` to start a new one.

Each guide declares itself to the builder with meta tags in its `<head>`:

```html
<meta name="guide:summary" content="One or two plain sentences for the index card.">
<meta name="guide:topics"  content="money,disability">
<meta name="guide:updated" content="2026-09-03">
<meta name="guide:reading" content="9">
<meta name="guide:order"   content="20">
```

`guide:topics` must come from the fixed vocabulary in `tools/build_guides.py`
(`money`, `disability`, `seniors`, `health`, `housing`, `getting-around`,
`everyday-costs`, `caregivers`). A typo is an error rather than a silent new
filter button nobody can press. `guide:order` sorts the index — low numbers
first; `start-here.html` is 10 and is flagged "Start here" on its card.

Then run:

```
python3 tools/build_guides.py
```

That rewrites three things from the guides themselves, between `BEGIN`/`END`
markers so nothing else on the page is touched:

- the topic buttons and guide cards in `guides/index.html`,
- `guides/feed.xml` (RSS, newest first),
- the `guides/` entries in `sitemap.xml`.

`python3 tools/build_guides.py --check` fails if any of those are out of date, so
it belongs next to `check_site.py` in the pre-push routine. The builder also
copies each guide's `<h2>`/`<h3>` headings onto its index card as invisible
`data-keywords`, which is what makes searching the index for a word used *inside*
a guide ("HandyDART", "Plan G") actually find it.

### What a guide must do

These pages are read by people who are tired, in pain, or on a phone, and who
have often already been given the runaround. The house rules:

- **Every figure traces to a source.** Each guide ends with "Where these numbers
  come from": real URLs and the date they were read. If a number could not be
  verified, write "check the current amount" and give a phone number — never
  guess, and never round a figure into something tidier than the source says.
- **Say when something has ended or does not apply here.** Sending a reader
  chasing a programme that is gone costs them a trip they may not be able to make.
- **Tell them what to say.** Most guides carry a `.script` block with the actual
  words to use on the phone; that is usually the hard part, not the eligibility.
- **Say what to do when the answer is no.** First refusals are often wrong and
  many are overturned with free advocacy.
- **Date every page** with the `.stamp` ("Checked on …") so a reader can judge for
  themselves whether to phone and confirm.

Guides carry no forms and collect nothing. They are just pages.

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

Check before pushing:

```
python3 tools/check_site.py && python3 tools/sync_numbers.py --check && python3 tools/build_guides.py --check
```

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
