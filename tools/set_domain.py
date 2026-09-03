#!/usr/bin/env python3
"""Point the whole site at a different domain, in one command.

The site currently lives at a temporary hostname. The moment the real domain is
registered and its DNS resolves, run:

    python3 tools/set_domain.py reachablesociety.ca

and every place the old hostname appears is updated: the CNAME file GitHub Pages
reads, the canonical link on each page, the OpenGraph url and image that social
apps and iMessage use to draw a preview, and the sitemap.

Run it with no arguments to see what the site currently claims, without changing
anything. Run it again with the old domain to undo. It is idempotent: running it
twice with the same domain is a no-op.

Do NOT run this before the domain resolves. GitHub Pages refuses to serve a site
whose CNAME points at a hostname that does not resolve to it, so switching early
takes the site down rather than moving it.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CNAME = ROOT / "CNAME"
# Anywhere a bare hostname can legitimately appear in this site.
PATTERNS = (
    ("canonical", re.compile(r'(<link rel="canonical" href="https://)([^/"]+)')),
    ("og:url", re.compile(r'(<meta property="og:url" content="https://)([^/"]+)')),
    ("og:image", re.compile(r'(<meta property="og:image" content="https://)([^/"]+)')),
    ("sitemap", re.compile(r"(<loc>https://)([^/<]+)")),
)
DOMAIN_RE = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$")


def targets() -> list[Path]:
    return sorted(ROOT.glob("*.html")) + [p for p in [ROOT / "sitemap.xml"] if p.exists()]


def current() -> str:
    return CNAME.read_text(encoding="utf-8").strip() if CNAME.exists() else ""


def survey() -> dict[str, set[str]]:
    """Every hostname the site currently claims, by where it appears."""
    found: dict[str, set[str]] = {}
    for path in targets():
        text = path.read_text(encoding="utf-8")
        for label, pattern in PATTERNS:
            for match in pattern.finditer(text):
                found.setdefault(label, set()).add(match.group(2))
    if current():
        found.setdefault("CNAME", set()).add(current())
    return found


def apply(new: str) -> tuple[int, int]:
    files_changed = 0
    edits = 0
    for path in targets():
        text = original = path.read_text(encoding="utf-8")
        for _, pattern in PATTERNS:
            text, n = pattern.subn(lambda m: m.group(1) + new, text)
            edits += n
        if text != original:
            path.write_text(text, encoding="utf-8")
            files_changed += 1
    # GitHub Pages wants the bare hostname and a trailing newline.
    if current() != new:
        CNAME.write_text(new + "\n", encoding="utf-8")
        files_changed += 1
    return files_changed, edits


def main() -> int:
    if len(sys.argv) == 1:
        print(f"CNAME: {current() or '(none)'}\n")
        for label, hosts in sorted(survey().items()):
            for host in sorted(hosts):
                print(f"  {label:10} {host}")
        print("\nTo change it:  python3 tools/set_domain.py <new-domain>")
        return 0

    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    new = sys.argv[1].strip().lower().removeprefix("https://").removeprefix("http://")
    new = new.rstrip("/")
    if not DOMAIN_RE.match(new):
        print(f"error: {new!r} does not look like a bare domain (expected e.g. reachablesociety.ca)")
        return 2

    hosts = {h for group in survey().values() for h in group}
    if hosts == {new}:
        print(f"Already pointed at {new}. Nothing to do.")
        return 0

    files_changed, edits = apply(new)
    print(f"Now pointed at {new}: {edits} link(s) rewritten across {files_changed} file(s).")
    print("Was: " + ", ".join(sorted(hosts - {new})) if hosts - {new} else "")
    print("\nNext: python3 tools/check_site.py, then commit and push.")
    print("GitHub Pages will re-issue the HTTPS certificate; allow a few minutes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
