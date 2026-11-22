#!/usr/bin/env python3
"""Static localization check for the iOS app (runs without a Swift toolchain).

1. apps/social-studio/i18n/{common,ios}.{de,en,ru}.json: identical key sets per namespace,
   identical {placeholder} sets per key, plural objects with the required CLDR forms.
2. Every L10n key referenced from Swift exists (literal keys, enum-derived keys
   like "stage.\\(rawValue)", DomainError keys incl. entity./field. params).
3. No hard-coded user-facing text left in common SwiftUI call sites.

Usage: python3 apps/social-studio/ios/tools/check_l10n.py   (exit code 1 on findings)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
IOS = HERE.parents[1]
I18N = IOS.parent / "i18n"
SRC = IOS / "SocialStudio"
LANGS = ["de", "en", "ru"]
NAMESPACES = ["common", "ios"]
PLURAL_FORMS = {"de": {"one", "other"}, "en": {"one", "other"}, "ru": {"one", "few", "many", "other"}}
PLACEHOLDER = re.compile(r"\{(\w+)\}")

# prefix used in Swift ("prefix.\(rawValue)") -> Swift type whose raw values complete the key
DYNAMIC_PREFIXES = {
    "platform": "Platform", "format": "ContentFormat", "aspect": "AspectRatio", "stage": "Stage",
    "role": "TeamRole", "scriptStatus": "ScriptStatus", "framing": "Framing", "angle": "CameraAngle",
    "movement": "CameraMovement", "shootStatus": "ShootStatus", "mediaKind": "MediaKind",
    "mediaStatus": "MediaStatus", "activity": "ActivityEvent", "lang": "AppLanguage",
    "ios.detail.tab": "Tab",
}

findings: list[str] = []


def load() -> dict[str, dict[str, dict]]:
    tables: dict[str, dict[str, dict]] = {}
    for ns in NAMESPACES:
        tables[ns] = {}
        for lang in LANGS:
            path = I18N / f"{ns}.{lang}.json"
            tables[ns][lang] = json.loads(path.read_text(encoding="utf-8"))
    return tables


def placeholders(value) -> set[str]:
    if isinstance(value, dict):
        out: set[str] = set()
        for v in value.values():
            out |= set(PLACEHOLDER.findall(v))
        return out
    return set(PLACEHOLDER.findall(value))


def check_tables(tables) -> set[str]:
    all_keys: set[str] = set()
    for ns, by_lang in tables.items():
        base = set(by_lang["de"])
        all_keys |= base
        for lang in LANGS[1:]:
            keys = set(by_lang[lang])
            for k in sorted(base - keys):
                findings.append(f"{ns}.{lang}.json: missing key {k}")
            for k in sorted(keys - base):
                findings.append(f"{ns}.{lang}.json: extra key {k}")
        for key in base:
            ref = placeholders(by_lang["de"][key])
            for lang in LANGS:
                value = by_lang[lang].get(key)
                if value is None:
                    continue
                if isinstance(value, dict):
                    missing = PLURAL_FORMS[lang] - set(value)
                    if missing:
                        findings.append(f"{ns}.{lang}.json: {key} lacks plural forms {sorted(missing)}")
                    if "count" not in placeholders(value):
                        findings.append(f"{ns}.{lang}.json: plural {key} does not use {{count}}")
                elif not isinstance(value, str) or not value.strip():
                    findings.append(f"{ns}.{lang}.json: {key} is empty or not a string")
                if placeholders(value) != ref:
                    findings.append(f"{ns}.{lang}.json: {key} placeholders {sorted(placeholders(value))} != de {sorted(ref)}")
    return all_keys


def swift_sources() -> dict[Path, str]:
    return {p: p.read_text(encoding="utf-8") for p in sorted(SRC.rglob("*.swift"))}


def enum_raw_values(sources: dict[Path, str], type_name: str, prefer: Path | None = None) -> list[str]:
    """Raw values of `enum <type_name>` (brace-matched body, top-level `case` lines only)."""
    ordered = sorted(sources.items(), key=lambda kv: kv[0] != prefer)
    for _, text in ordered:
        m = re.search(r"enum\s+" + re.escape(type_name) + r"\s*:[^{]*\{", text)
        if not m:
            continue
        depth, i = 1, m.end()
        while depth and i < len(text):
            depth += {"{": 1, "}": -1}.get(text[i], 0)
            i += 1
        body = text[m.end():i - 1]
        values: list[str] = []
        nest = 0
        for line in body.splitlines():
            stripped = line.strip()
            if nest == 0 and stripped.startswith("case ") and not stripped.startswith("case ."):
                for part in stripped[5:].split(","):
                    part = part.strip()
                    if not part or "(" in part:
                        continue
                    values.append(part.split("=", 1)[1].strip().strip('"') if "=" in part else part)
            nest += line.count("{") - line.count("}")
        return values
    findings.append(f"enum {type_name} not found for dynamic keys")
    return []


def check_references(sources, all_keys: set[str]) -> None:
    literal = re.compile(r'L10n\.tp?\("([^"\\]+)"')
    dynamic = re.compile(r'L10n\.tp?\("([A-Za-z0-9_.]+)\.\\\(')
    domain = re.compile(r'DomainError\("([^"]+)"')
    nested = re.compile(r'DomainError\.(?:notFound|required)\("([^"]+)"\)')
    for path, text in sources.items():
        rel = path.relative_to(IOS)
        for key in literal.findall(text) + domain.findall(text) + nested.findall(text):
            if key not in all_keys:
                findings.append(f"{rel}: unknown key {key}")
        for prefix in dynamic.findall(text):
            type_name = DYNAMIC_PREFIXES.get(prefix)
            if not type_name:
                findings.append(f"{rel}: dynamic key prefix {prefix}.* has no enum mapping")
                continue
            for raw in enum_raw_values(sources, type_name, prefer=path):
                if f"{prefix}.{raw}" not in all_keys:
                    findings.append(f"{rel}: missing key {prefix}.{raw} (from {type_name})")


UI_CALLS = re.compile(
    r'(?:\bText|\bButton|\bLabel|\bToggle|\bPicker|\bSection|\bTextField|\bDatePicker|\bMenu|\bLabeledContent|'
    r'\bDisclosureGroup|navigationTitle|\.alert|confirmationDialog|accessibilityLabel|accessibilityHint|'
    r'\btitle:|\bmessage:|\bprompt:|\bsubtitle:|\bdetail:)\s*\(?\s*"((?:[^"\\]|\\.)*)"'
)
ALLOWED_LITERALS = {"#hashtag #hashtag", "–"}


def check_hardcoded(sources) -> None:
    for path, text in sources.items():
        rel = path.relative_to(IOS)
        for lineno, line in enumerate(text.splitlines(), 1):
            if line.strip().startswith("//"):
                continue
            for m in UI_CALLS.finditer(line):
                lit = m.group(1)
                if lit in ALLOWED_LITERALS:
                    continue
                stripped = re.sub(r"\\\((?:[^()]|\([^()]*\))*\)", "", lit)
                if re.search(r"[A-Za-zÄÖÜäöüßА-Яа-я]{2,}", stripped):
                    findings.append(f"{rel}:{lineno}: hard-coded UI text \"{lit}\"")


def main() -> int:
    tables = load()
    all_keys = check_tables(tables)
    sources = swift_sources()
    check_references(sources, all_keys)
    check_hardcoded(sources)
    if findings:
        print("\n".join(findings))
        print(f"\n{len(findings)} finding(s)")
        return 1
    total = sum(len(t["de"]) for t in tables.values())
    print(f"OK: {total} keys × {len(LANGS)} languages consistent; all Swift references resolve; no hard-coded UI text found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
