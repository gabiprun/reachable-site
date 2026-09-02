#!/usr/bin/env python3
"""Copy the phone numbers and email from site-config.js into the HTML pages.

Why this exists: browsers with JavaScript turned off cannot read site-config.js,
so every page carries a plain-text copy of the numbers. After you edit
site-config.js, run this once so the two stay identical:

    python3 tools/sync_numbers.py           # rewrite the pages
    python3 tools/sync_numbers.py --check   # exit 1 if any page is out of date

What it touches (nothing else):
  <span data-number="line">…</span>      text; becomes an <a href="tel:…"> when numbersReady is true
  <div … data-number-row>                gets `hidden` when that number is empty
  … data-number-status / data-not-ready  gets `hidden` when numbersReady is true
  … data-when-ready                      gets `hidden` when numbersReady is false
  <a data-email href="mailto:…">…</a>    address and text
  <form … action="mailto:…">             address (the no-JavaScript fallback)

No third-party packages: standard library only.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "site-config.js"


def read_config() -> dict:
    text = CONFIG.read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)  # block comments
    text = re.sub(r"^\s*//.*$", "", text, flags=re.M)  # line comments

    def grab(key: str) -> str:
        m = re.search(rf"\b{key}\s*:\s*'([^']*)'", text)
        if not m:
            sys.exit(f"site-config.js: could not find {key}")
        return m.group(1).strip()

    ready = re.search(r"\bnumbersReady\s*:\s*(true|false)", text)
    if not ready:
        sys.exit("site-config.js: could not find numbersReady")
    return {
        "numbers": {"line": grab("line"), "access": grab("access"), "office": grab("office")},
        "ready": ready.group(1) == "true",
        "email": grab("email"),
    }


def tel_href(display: str) -> str:
    digits = re.sub(r"\D", "", display)
    if len(digits) == 10:
        digits = "1" + digits
    return f"tel:+{digits}" if digits else ""


def set_hidden(tag_open: str, hidden: bool) -> str:
    """Add or remove the `hidden` attribute on one opening tag."""
    cleaned = re.sub(r"\s+hidden(?==|\s|>)", "", tag_open)
    if hidden:
        return cleaned[:-1].rstrip() + " hidden>"
    return cleaned


def sync(html: str, cfg: dict) -> str:
    numbers, ready, email = cfg["numbers"], cfg["ready"], cfg["email"]

    # 1. The numbers themselves.
    def number_sub(m: re.Match) -> str:
        attrs, key = m.group(2), m.group(3)
        value = numbers.get(key, "")
        attrs = re.sub(r'\s+href="[^"]*"', "", attrs)
        if ready and value:
            return f'<a{attrs} href="{tel_href(value)}">{value}</a>'
        return f"<span{attrs}>{value}</span>"

    html = re.sub(
        r'<(span|a)((?:\s[^>]*?)?\sdata-number="(\w+)"[^>]*)>(.*?)</\1>',
        number_sub,
        html,
        flags=re.S,
    )

    # 2. Rows that wrap a number: hide the row when that number is empty.
    def row_sub(m: re.Match) -> str:
        tag_open, inner = m.group(1), m.group(2)
        key = re.search(r'data-number="(\w+)"', inner)
        empty = bool(key) and not numbers.get(key.group(1), "")
        return set_hidden(tag_open, empty) + inner + "</div>"

    html = re.sub(r"(<div[^>]*\bdata-number-row\b[^>]*>)(.*?)</div>", row_sub, html, flags=re.S)

    # 3. "Coming soon" notes and their opposites.
    html = re.sub(
        r"<\w+[^>]*\b(?:data-number-status|data-not-ready)\b[^>]*>",
        lambda m: set_hidden(m.group(0), ready),
        html,
    )
    html = re.sub(
        r"<\w+[^>]*\bdata-when-ready\b[^>]*>",
        lambda m: set_hidden(m.group(0), not ready),
        html,
    )

    # 4. Email links and the no-JavaScript form fallback.
    def email_sub(m: re.Match) -> str:
        attrs = re.sub(r'\s+href="[^"]*"', "", m.group(1))
        return f'<a{attrs} href="mailto:{email}">{email}</a>'

    html = re.sub(r"<a((?:\s[^>]*?)?\sdata-email\b[^>]*)>(.*?)</a>", email_sub, html, flags=re.S)
    html = re.sub(r'action="mailto:[^"]*"', f'action="mailto:{email}"', html)
    return html


def main(argv: list[str]) -> int:
    check = "--check" in argv
    cfg = read_config()
    changed = []
    for page in sorted(ROOT.glob("*.html")):
        before = page.read_text(encoding="utf-8")
        after = sync(before, cfg)
        if after != before:
            changed.append(page.name)
            if not check:
                page.write_text(after, encoding="utf-8")
    state = "live" if cfg["ready"] else "placeholders (coming soon)"
    print(f"numbers: line={cfg['numbers']['line']!r} access={cfg['numbers']['access']!r} "
          f"office={cfg['numbers']['office']!r} email={cfg['email']!r} -> {state}")
    if check:
        if changed:
            print("OUT OF DATE:", ", ".join(changed), "- run: python3 tools/sync_numbers.py")
            return 1
        print("all pages match site-config.js")
        return 0
    print("updated:", ", ".join(changed) if changed else "nothing (already in sync)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
