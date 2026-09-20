#!/usr/bin/env python3
"""Verify packet completeness, JSON syntax, manifest references and fixture parsing.

Uses only the standard library; also validates JSON Schemas and parser output
when jsonschema is already installed. It does not install dependencies or run
game/device tests. SHA256SUMS verifies original packet files if present.
"""
from __future__ import annotations
import csv
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from import_legacy_dat import parse_dat


def main() -> int:
    failures: list[str] = []
    notes: list[str] = []
    try:
        index = json.loads((ROOT/"manifests/packet_index.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"FAIL packet index: {exc}")
        return 1
    for rel in index["requiredFiles"]:
        if not (ROOT/rel).is_file(): failures.append(f"missing required file: {rel}")
    parsed_json = {}
    for base in [ROOT/"manifests", ROOT/"schemas"]:
        for path in sorted(base.glob("*.json")):
            try: parsed_json[path.relative_to(ROOT).as_posix()] = json.loads(path.read_text(encoding="utf-8"))
            except (OSError,ValueError) as exc: failures.append(f"JSON {path.name}: {exc}")
    for name in ["requirements.csv","assets.csv"]:
        try:
            with (ROOT/"manifests"/name).open(newline="",encoding="utf-8") as fh: rows=list(csv.DictReader(fh))
            ids=[r["id"] for r in rows]
            if not rows or len(ids)!=len(set(ids)): failures.append(f"empty/duplicate IDs in {name}")
            for row in rows:
                if row.get("spec") and not (ROOT/row["spec"]).is_file(): failures.append(f"missing spec for {row['id']}")
                if row.get("status") not in {"NOT_STARTED","NOT_CREATED"}: failures.append(f"packet {row['id']} unexpectedly claims implementation status")
            notes.append(f"{name}: {len(rows)} unique planned rows")
        except (OSError,KeyError,ValueError) as exc: failures.append(f"CSV {name}: {exc}")
    tiles=parsed_json.get("manifests/legacy_tiles.json",{}).get("tiles",[])
    if {r.get("id") for r in tiles} != set(range(112)): failures.append("legacy tile manifest must cover 0x00..0x6F")
    notes.append(f"Legacy tile mappings: {len(tiles)}")
    fixtures=[]
    for path in sorted((ROOT/"resources/fixtures").glob("*.dat")):
        try:
            fixtures.append(parse_dat(path.read_bytes(),path.name))
            notes.append(f"Parsed original synthetic fixture: {path.name}")
        except ValueError as exc: failures.append(f"fixture {path.name}: {exc}")
    try:
        from jsonschema import Draft202012Validator
        for name,obj in parsed_json.items():
            if name.startswith("schemas/"): Draft202012Validator.check_schema(obj)
        raw_schema=parsed_json["schemas/legacy-dat-raw.schema.json"]
        for fixture in fixtures: Draft202012Validator(raw_schema).validate(fixture)
        notes.append("JSON Schema 2020-12 meta-validation and raw fixture schema validation: PASS")
    except ImportError:
        notes.append("jsonschema not installed: schema syntax parsed, full schema validation NOT RUN (no install attempted)")
    except Exception as exc:
        failures.append(f"schema validation: {exc}")
    sums=ROOT/"SHA256SUMS.txt"
    if sums.exists():
        count=0
        for line in sums.read_text(encoding="utf-8").splitlines():
            if not line.strip(): continue
            expected,rel=line.split("  ",1)
            path=ROOT/rel
            if not path.is_file(): failures.append(f"hash input absent: {rel}")
            elif hashlib.sha256(path.read_bytes()).hexdigest()!=expected: failures.append(f"hash changed: {rel}")
            count+=1
        notes.append(f"SHA256 inventory checked: {count} files")
    else: notes.append("SHA256SUMS not yet generated: preparation mode")
    for note in notes: print(note)
    for error in failures: print("FAIL: "+error)
    print("PACKAGE CHECK: "+("FAIL" if failures else "PASS"))
    print("Scope: packet/tooling only. No game, Blender, XPS, full-campaign or physical-device validation asserted.")
    return 1 if failures else 0


if __name__ == "__main__": raise SystemExit(main())
