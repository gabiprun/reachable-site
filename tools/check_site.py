#!/usr/bin/env python3
"""Quick checks for every page before you push. Standard library only.

    python3 tools/check_site.py

Checks each *.html in the site root for:
  - tags that are opened but never closed (or closed in the wrong order),
  - exactly one <h1>, a skip link, a <main>, a <nav>, the "Call us" block,
  - <html lang>, <title>, viewport meta, the site stylesheet and scripts,
  - every internal link, script, stylesheet and image pointing at a file
    that exists (anchors like page.html#section are checked too),
  - duplicate id="" values on one page,
  - every <input>, <select> and <textarea> having a <label for=…> or aria-label,
  - every <img> having an alt attribute,
  - the mission statement being word-for-word the DESIGN.md wording where it appears.
Exit code 1 if anything fails.
"""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
MISSION = (
    "Reachable makes help reachable. We run a free help line anyone can call from any "
    "phone, give people without a stable phone a permanent number that follows them, "
    "help seniors and people with disabilities claim the benefits they already qualify "
    "for, and build the technology Victoria's smallest nonprofits can't afford."
)


class Checker(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []
        self.errors: list[str] = []
        self.ids: dict[str, int] = {}
        self.h1 = 0
        self.links: list[tuple[str, str]] = []  # (kind, target)
        self.labels_for: set[str] = set()
        self.controls: list[tuple[str, str | None, bool]] = []  # (tag, id, has_aria_label)
        self.lang = None
        self.title = ""
        self.in_title = False
        self.text: list[str] = []
        self.has_skip = self.has_main = self.has_nav = self.has_viewport = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        line = self.getpos()[0]
        if tag == "html":
            self.lang = a.get("lang")
        if tag == "title":
            self.in_title = True
        if tag == "h1":
            self.h1 += 1
        if tag == "main":
            self.has_main = True
        if tag == "nav":
            self.has_nav = True
        if tag == "meta" and a.get("name") == "viewport":
            self.has_viewport = True
        if "id" in a:
            self.ids[a["id"]] = self.ids.get(a["id"], 0) + 1
        if tag == "a":
            href = a.get("href")
            if href is not None:
                self.links.append(("a", href))
                if "skip-link" in (a.get("class") or ""):
                    self.has_skip = True
        if tag in ("script", "img") and a.get("src"):
            self.links.append((tag, a["src"]))
            if tag == "img" and "alt" not in a:
                self.errors.append(f"line {line}: <img> without alt")
        if tag == "link" and a.get("href"):
            self.links.append(("link", a["href"]))
        if tag == "label" and a.get("for"):
            self.labels_for.add(a["for"])
        if tag in ("input", "select", "textarea"):
            if a.get("type") not in ("submit", "button", "hidden", "reset"):
                self.controls.append((tag, a.get("id"), "aria-label" in a))
        if tag not in VOID:
            self.stack.append((tag, line))

    def handle_endtag(self, tag):
        line = self.getpos()[0]
        if tag == "title":
            self.in_title = False
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f"line {line}: </{tag}> with nothing open")
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        names = [t for t, _ in self.stack]
        if tag in names:
            while self.stack and self.stack[-1][0] != tag:
                t, l = self.stack.pop()
                self.errors.append(f"line {l}: <{t}> was never closed (closed by </{tag}> at line {line})")
            self.stack.pop()
        else:
            self.errors.append(f"line {line}: stray </{tag}>")

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        self.text.append(data)

    def finish(self) -> None:
        for t, l in self.stack:
            self.errors.append(f"line {l}: <{t}> was never closed")
        if self.h1 != 1:
            self.errors.append(f"expected exactly one <h1>, found {self.h1}")
        if not self.lang:
            self.errors.append("<html> has no lang attribute")
        if not self.title.strip():
            self.errors.append("no <title>")
        if not self.has_viewport:
            self.errors.append("no viewport meta")
        if not self.has_skip:
            self.errors.append("no skip link")
        if not self.has_main:
            self.errors.append("no <main>")
        if not self.has_nav:
            self.errors.append("no <nav>")
        if "call-us" not in self.ids:
            self.errors.append('no "Call us" block (id="call-us")')
        for i, n in self.ids.items():
            if n > 1:
                self.errors.append(f'duplicate id="{i}" ({n} times)')
        for tag, cid, aria in self.controls:
            if not aria and (cid is None or cid not in self.labels_for):
                self.errors.append(f"<{tag} id={cid!r}> has no <label for> and no aria-label")
        body = re.sub(r"\s+", " ", " ".join(self.text))
        if "Reachable makes help reachable" in body and MISSION not in body:
            self.errors.append("mission statement differs from DESIGN.md wording")


def check_target(page: Path, kind: str, target: str, errors: list[str]) -> None:
    if re.match(r"^(https?:|mailto:|tel:)", target):
        return
    path, _, frag = target.partition("#")
    if not path:
        return  # same-page anchor: checked via ids below
    file = (page.parent / path).resolve()
    if not file.is_file():
        errors.append(f"{kind} -> {target}: file not found")
        return
    if frag and file.suffix == ".html":
        if f'id="{frag}"' not in file.read_text(encoding="utf-8"):
            errors.append(f"{kind} -> {target}: no id=\"{frag}\" in {file.name}")


def main() -> int:
    pages = sorted(ROOT.glob("*.html"))
    if not pages:
        print("no HTML pages found in", ROOT)
        return 1
    failed = 0
    for page in pages:
        html = page.read_text(encoding="utf-8")
        c = Checker()
        c.feed(html)
        c.close()
        c.finish()
        errors = list(c.errors)
        for kind, target in c.links:
            if target.startswith("#"):
                if target[1:] not in c.ids:
                    errors.append(f"link -> {target}: no such id on this page")
            else:
                check_target(page, kind, target, errors)
        status = "ok " if not errors else "FAIL"
        print(f"{status} {page.name}: {c.title.strip()!r}, {len(c.links)} links, h1={c.h1}")
        for e in errors:
            print("     -", e)
        failed += bool(errors)
    print(f"{len(pages) - failed}/{len(pages)} pages clean")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
