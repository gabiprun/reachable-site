#!/usr/bin/env python3
"""Build the Guides index, the RSS feed and the sitemap from the guide pages.

    python3 tools/build_guides.py            # rewrite the generated blocks
    python3 tools/build_guides.py --check    # fail if they are out of date

Standard library only, like every other tool here.

Each guide in guides/ declares itself with meta tags in its <head>:

    <meta name="guide:summary" content="one or two plain sentences">
    <meta name="guide:topics"  content="money,disability">
    <meta name="guide:updated" content="2026-09-03">
    <meta name="guide:reading" content="9">
    <meta name="guide:order"   content="20">

This script reads those, plus each page's <title> and <h1>, and rewrites:

  guides/index.html   the topic buttons and the list of guide cards,
                      between the BEGIN/END generated markers
  guides/feed.xml     an RSS feed of the guides, newest first
  sitemap.xml         the <url> entries for guides/, between the markers

guides/index.html and guides/start-here.html are hand-written pages; the
index is skipped as a card, start-here is included but always sorted first
by its guide:order.
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GUIDES = ROOT / "guides"
SITE = "https://reachable.prundaru.ca"

# The topic vocabulary. Order here is the order the buttons appear in.
# A guide claiming a topic that is not on this list is an error, so a
# typo cannot quietly create a filter button nobody can ever press.
TOPICS = [
    ("money", "Money and benefits"),
    ("disability", "Disability"),
    ("seniors", "Seniors"),
    ("health", "Health and medicine"),
    ("housing", "Housing"),
    ("getting-around", "Getting around"),
    ("everyday-costs", "Everyday costs"),
    ("caregivers", "Caregivers"),
]
TOPIC_LABELS = dict(TOPICS)

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
RSS_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
RSS_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


class GuideError(Exception):
    pass


def meta(source: str, name: str) -> str:
    """Value of <meta name="..." content="...">, either attribute order."""
    for pattern in (
        rf'<meta\s+name="{re.escape(name)}"\s+content="([^"]*)"',
        rf'<meta\s+content="([^"]*)"\s+name="{re.escape(name)}"',
    ):
        m = re.search(pattern, source)
        if m:
            return html.unescape(m.group(1)).strip()
    return ""


def read_guide(path: Path) -> dict:
    source = path.read_text(encoding="utf-8")

    title_m = re.search(r"<title>(.*?)</title>", source, re.S)
    h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", source, re.S)
    if not title_m or not h1_m:
        raise GuideError(f"{path.name}: needs a <title> and an <h1>")

    # The <h1> is the human name; the <title> carries the " — Reachable" suffix.
    heading = html.unescape(re.sub(r"<[^>]+>", "", h1_m.group(1))).strip()
    heading = re.sub(r"\s+", " ", heading)

    summary = meta(source, "guide:summary")
    updated = meta(source, "guide:updated")
    topics_raw = meta(source, "guide:topics")
    reading = meta(source, "guide:reading")
    order = meta(source, "guide:order")

    missing = [n for n, v in
               (("guide:summary", summary), ("guide:updated", updated),
                ("guide:topics", topics_raw)) if not v]
    if missing:
        raise GuideError(f"{path.name}: missing {', '.join(missing)}")

    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", updated):
        raise GuideError(f"{path.name}: guide:updated must be YYYY-MM-DD, got {updated!r}")

    topics = [t.strip() for t in topics_raw.split(",") if t.strip()]
    unknown = [t for t in topics if t not in TOPIC_LABELS]
    if unknown:
        raise GuideError(
            f"{path.name}: unknown topic(s) {', '.join(unknown)}. "
            f"Known topics: {', '.join(TOPIC_LABELS)}"
        )

    # The index search box should find a guide by a word that appears inside
    # it ("HandyDART", "SAFER", "Plan G"), not only by its title and summary.
    # The section headings are a good, cheap summary of what a guide covers,
    # so they travel with the card as invisible keywords.
    keywords = []
    for m in re.finditer(r"<h[23][^>]*>(.*?)</h[23]>", source, re.S):
        text = html.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))
        text = re.sub(r"\s+", " ", text).strip()
        if text and text.lower() not in ("what is on this page", "at a glance"):
            keywords.append(text)

    return {
        "file": path.name,
        "heading": heading,
        "summary": summary,
        "topics": topics,
        "updated": updated,
        "reading": reading,
        "keywords": " ".join(keywords),
        "order": int(order) if order.isdigit() else 999,
    }


def long_date(iso: str) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{d} {MONTHS[m - 1]} {y}"


def rss_date(iso: str) -> str:
    """RFC 822 date. Guides carry a day, not a time; noon UTC is honest enough."""
    import datetime
    y, m, d = (int(x) for x in iso.split("-"))
    dt = datetime.date(y, m, d)
    return f"{RSS_DAYS[dt.weekday()]}, {d:02d} {RSS_MONTHS[m - 1]} {y} 12:00:00 +0000"


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def render_topics(guides: list[dict]) -> str:
    used = {t for g in guides for t in g["topics"]}
    out = ['<ul class="topic-list">']
    for key, label in TOPICS:
        if key not in used:
            continue
        n = sum(1 for g in guides if key in g["topics"])
        word = "guide" if n == 1 else "guides"
        out.append(
            f'        <li><button type="button" class="topic-btn" data-topic="{key}" '
            f'aria-pressed="false">{esc(label)} '
            f'<span class="visually-hidden">({n} {word})</span></button></li>'
        )
    out.append("      </ul>")
    return "\n".join(out)


def render_cards(guides: list[dict]) -> str:
    out = []
    for g in guides:
        topics_attr = " ".join(g["topics"])
        labels = ", ".join(TOPIC_LABELS[t] for t in g["topics"])
        start = g["file"] == "start-here.html"
        cls = "guide-card guide-card-start" if start else "guide-card"
        flag = '\n            <p class="guide-flag">Start here</p>' if start else ""
        reading = f'<span>{esc(g["reading"])} min read</span>' if g["reading"] else ""
        out.append(
            f'        <li data-topics="{esc(topics_attr)}" data-keywords="{esc(g["keywords"])}">\n'
            f'          <article class="{cls}">{flag}\n'
            f'            <h3><a href="{esc(g["file"])}">{esc(g["heading"])}</a></h3>\n'
            f'            <p>{esc(g["summary"])}</p>\n'
            f'            <p class="guide-meta"><span>{esc(labels)}</span>'
            f'{reading}<span>Checked {esc(long_date(g["updated"]))}</span></p>\n'
            f"          </article>\n"
            f"        </li>"
        )
    return "\n".join(out)


def replace_block(text: str, marker: str, body: str, path: Path) -> str:
    begin, end = f"<!-- BEGIN {marker} -->", f"<!-- END {marker} -->"
    pattern = re.compile(
        re.escape(begin) + r"\n(.*?)([ \t]*)" + re.escape(end), re.S
    )
    m = pattern.search(text)
    if not m:
        raise GuideError(f"{path.name}: missing {begin} / {end} markers")
    indent = m.group(2)
    return text[: m.start()] + f"{begin}\n{body}\n{indent}{end}" + text[m.end():]


def build_feed(guides: list[dict]) -> str:
    by_date = sorted(guides, key=lambda g: (g["updated"], g["file"]), reverse=True)
    items = []
    for g in by_date:
        link = f"{SITE}/guides/{g['file']}"
        items.append(
            "    <item>\n"
            f"      <title>{esc(g['heading'])}</title>\n"
            f"      <link>{link}</link>\n"
            f"      <guid isPermaLink=\"true\">{link}</guid>\n"
            f"      <description>{esc(g['summary'])}</description>\n"
            f"      <pubDate>{rss_date(g['updated'])}</pubDate>\n"
            "    </item>"
        )
    newest = by_date[0]["updated"] if by_date else "2026-09-03"
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0">\n'
        "  <channel>\n"
        "    <title>Reachable — Guides</title>\n"
        f"    <link>{SITE}/guides/index.html</link>\n"
        "    <description>Plain-language guides to the benefits and services "
        "seniors and people with disabilities in Victoria, BC can claim.</description>\n"
        "    <language>en-ca</language>\n"
        f"    <lastBuildDate>{rss_date(newest)}</lastBuildDate>\n"
        + "\n".join(items)
        + "\n  </channel>\n</rss>\n"
    )


def build_sitemap(guides: list[dict], text: str) -> str:
    rows = [
        f"  <url><loc>{SITE}/guides/index.html</loc>"
        f"<lastmod>{max(g['updated'] for g in guides)}</lastmod></url>"
    ]
    for g in sorted(guides, key=lambda g: g["file"]):
        rows.append(
            f"  <url><loc>{SITE}/guides/{g['file']}</loc>"
            f"<lastmod>{g['updated']}</lastmod></url>"
        )
    return replace_block(text, "generated guide urls", "\n".join(rows), ROOT / "sitemap.xml")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if any generated file would change")
    args = ap.parse_args()

    if not GUIDES.is_dir():
        print("no guides/ directory", file=sys.stderr)
        return 1

    guides, errors = [], []
    for path in sorted(GUIDES.glob("*.html")):
        if path.name == "index.html":
            continue
        try:
            guides.append(read_guide(path))
        except GuideError as e:
            errors.append(str(e))

    if errors:
        for e in errors:
            print("error:", e, file=sys.stderr)
        return 1
    if not guides:
        print("no guides found in guides/", file=sys.stderr)
        return 1

    guides.sort(key=lambda g: (g["order"], g["heading"]))

    index_path = GUIDES / "index.html"
    feed_path = GUIDES / "feed.xml"
    sitemap_path = ROOT / "sitemap.xml"

    index_text = index_path.read_text(encoding="utf-8")
    new_index = replace_block(index_text, "generated topic buttons",
                              "      " + render_topics(guides), index_path)
    new_index = replace_block(new_index, "generated guide cards",
                              render_cards(guides), index_path)
    new_feed = build_feed(guides)
    new_sitemap = build_sitemap(guides, sitemap_path.read_text(encoding="utf-8"))

    targets = [
        (index_path, index_text, new_index),
        (feed_path, feed_path.read_text(encoding="utf-8") if feed_path.exists() else "", new_feed),
        (sitemap_path, sitemap_path.read_text(encoding="utf-8"), new_sitemap),
    ]

    stale = [p for p, old, new in targets if old != new]
    if args.check:
        for p in stale:
            print("out of date:", p.relative_to(ROOT))
        if stale:
            print("run: python3 tools/build_guides.py", file=sys.stderr)
            return 1
        print(f"ok — {len(guides)} guides, generated files up to date")
        return 0

    for p, _old, new in targets:
        p.write_text(new, encoding="utf-8")

    topics_used = sorted({t for g in guides for t in g["topics"]})
    print(f"{len(guides)} guides -> guides/index.html, guides/feed.xml, sitemap.xml")
    print(f"topics: {', '.join(topics_used)}")
    for g in guides:
        print(f"  {g['order']:>3}  {g['file']:<34} {g['updated']}  {', '.join(g['topics'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
