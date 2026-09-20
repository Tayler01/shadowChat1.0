#!/usr/bin/env python3
"""Bounded, loss-preserving MSCC DAT/CCL parser; not a game-engine converter.

Reference: https://www.seasip.info/ccfile.html. Original implementation for this
packet; no emulator code used. Python 3.10+, standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
from typing import Any

MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_LEVELS = 4096
CELL_COUNT = 32 * 32
MAGICS = {0x0002AAAC: "mscc", 0x0102AAAC: "lynx-hint"}
SPECIAL_TILES = {0x20, *range(0x33, 0x40)}


class DatError(ValueError):
    """Malformed or unsupported input, with context safe to display as text."""


class Reader:
    def __init__(self, data: bytes, context: str = "file") -> None:
        self.data, self.pos, self.context = data, 0, context

    @property
    def remaining(self) -> int:
        return len(self.data) - self.pos

    def take(self, count: int) -> bytes:
        if count < 0 or count > self.remaining:
            raise DatError(f"{self.context}: truncated at byte {self.pos}; need {count}, have {self.remaining}")
        result = self.data[self.pos:self.pos + count]
        self.pos += count
        return result

    def u8(self) -> int:
        return self.take(1)[0]

    def u16(self) -> int:
        return struct.unpack("<H", self.take(2))[0]

    def u32(self) -> int:
        return struct.unpack("<I", self.take(4))[0]

    def done(self) -> None:
        if self.remaining:
            raise DatError(f"{self.context}: {self.remaining} unexpected trailing bytes")


def decode_layer(data: bytes) -> list[int]:
    """Decode a single bounded RLE layer to exactly 1024 tile IDs."""
    r = Reader(data, "layer")
    cells: list[int] = []
    while r.remaining:
        tile = r.u8()
        count = 1
        if tile == 0xFF:
            count, tile = r.u8(), r.u8()
            if count == 0:
                raise DatError("layer: zero-length RLE run")
        if tile > 0x6F:
            raise DatError(f"layer: unsupported tile ID 0x{tile:02X}; not converted to floor")
        if len(cells) + count > CELL_COUNT:
            raise DatError("layer: RLE expands beyond 1024 cells")
        cells.extend([tile] * count)
    if len(cells) != CELL_COUNT:
        raise DatError(f"layer: expected 1024 cells, got {len(cells)}")
    return cells


def decode_text(payload: bytes, *, encoded: bool = False) -> str:
    # Preserve raw bytes in output; cp1252 is a convenience interpretation only.
    if payload.endswith(b"\x00"):
        payload = payload[:-1]
    if encoded:
        payload = bytes(value ^ 0x99 for value in payload)
    return payload.decode("cp1252", errors="replace")


def parse_fields(data: bytes) -> tuple[list[dict[str, Any]], list[str]]:
    r = Reader(data, "optional fields")
    fields: list[dict[str, Any]] = []
    warnings: list[str] = []
    seen: set[int] = set()
    while r.remaining:
        field_type, length = r.u8(), r.u8()
        payload = r.take(length)
        field: dict[str, Any] = {"type": field_type, "length": length, "rawHex": payload.hex()}
        if field_type in seen:
            warnings.append(f"duplicate optional field {field_type}: preserved in source order; normalization must resolve")
        seen.add(field_type)
        if field_type in {3, 6, 7, 8}:
            field["text"] = decode_text(payload, encoded=(field_type == 6))
            if not payload.endswith(b"\0"):
                warnings.append(f"field {field_type} has no terminal NUL")
            if b"\0" in payload[:-1]:
                warnings.append(f"field {field_type} contains embedded NUL; raw bytes retained")
        elif field_type in {4, 5}:
            width = 10 if field_type == 4 else 8
            if length % width:
                raise DatError(f"field {field_type}: link record length is not a multiple of {width}")
            links = []
            for offset in range(0, length, width):
                values = struct.unpack("<5H" if width == 10 else "<4H", payload[offset:offset+width])
                if any(v >= 32 for v in values[:4]):
                    raise DatError(f"field {field_type}: link coordinate outside 32x32 grid")
                link = {"button": list(values[:2]), "target": list(values[2:4])}
                if width == 10:
                    link["legacyState"] = values[4]
                links.append(link)
            field["links"] = links
        elif field_type == 10:
            if length % 2:
                raise DatError("field 10: movement record requires coordinate pairs")
            actors = [list(payload[i:i+2]) for i in range(0, length, 2)]
            if any(v >= 32 for pair in actors for v in pair):
                raise DatError("field 10: actor coordinate outside 32x32 grid")
            field["actorOrder"] = actors  # duplicates/order deliberately not sorted away
            if len({tuple(pair) for pair in actors}) != len(actors):
                warnings.append("field 10 contains duplicate actor coordinates")
        fields.append(field)
    return fields, warnings


def parse_dat(data: bytes, source_name: str = "input.dat") -> dict[str, Any]:
    if not isinstance(data, bytes):
        raise TypeError("data must be bytes")
    if len(data) > MAX_FILE_BYTES:
        raise DatError("file exceeds 16 MiB input limit")
    r = Reader(data)
    magic, count = r.u32(), r.u16()
    if magic not in MAGICS:
        raise DatError(f"unsupported magic 0x{magic:08X}")
    if not 1 <= count <= MAX_LEVELS:
        raise DatError(f"level count must be 1..{MAX_LEVELS}, got {count}")
    levels: list[dict[str, Any]] = []
    numbers: set[int] = set()
    warnings: list[str] = []
    for index in range(count):
        offset = r.pos
        size = r.u16()
        record = r.take(size)
        item = Reader(record, f"level record {index+1}")
        number, time_limit, chips, encoding = item.u16(), item.u16(), item.u16(), item.u16()
        if encoding != 1:
            raise DatError(f"level record {index+1}: map encoding {encoding} is not supported; no guessing")
        upper_encoded = item.take(item.u16())
        lower_encoded = item.take(item.u16())
        optional = item.take(item.u16())
        item.done()
        upper, lower = decode_layer(upper_encoded), decode_layer(lower_encoded)
        fields, level_warnings = parse_fields(optional)
        if number in numbers:
            level_warnings.append("duplicate source level number; use record index plus pack hash as identity")
        numbers.add(number)
        special = sorted(set(upper + lower) & SPECIAL_TILES)
        if special:
            level_warnings.append("internal/unused tile IDs require explicit normalization: " + ",".join(f"0x{x:02X}" for x in special))
        if len(optional) > 1152:
            level_warnings.append("optional fields exceed historical 1152-byte compatibility warning threshold")
        levels.append({
            "recordIndex": index, "sourceLevelNumber": number, "timeLimitSeconds": time_limit,
            "requiredChips": chips, "mapEncoding": encoding, "width": 32, "height": 32,
            "upper": upper, "lower": lower, "optionalFields": fields,
            "sourceOffset": offset, "recordByteLength": size, "recordRawHex": record.hex(),
            "recordSha256": hashlib.sha256(record).hexdigest(),
            "warnings": level_warnings,
        })
    r.done()
    if magic == 0x0102AAAC:
        warnings.append("Header requests Lynx rules in Tile World; do not assume MSCC scheduling")
    return {
        "schemaVersion": 1, "format": "legacy-dat-raw", "sourceName": Path(source_name).name,
        "sourceSha256": hashlib.sha256(data).hexdigest(), "sourceBytes": len(data),
        "magicHex": f"0x{magic:08X}", "rulesetHint": MAGICS[magic],
        "levelCount": count, "levels": levels, "warnings": warnings,
        "validationScope": "Structural import only; no license, campaign identity or solvability assertion",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("input", type=Path)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--overwrite", action="store_true")
    args = ap.parse_args()
    temp_name: str | None = None
    try:
        if args.input.resolve() == args.output.resolve():
            raise DatError("input and output must be different paths")
        if args.output.exists() and not args.overwrite:
            raise DatError("output exists; choose a new path or explicitly use --overwrite")
        with args.input.open("rb") as fh:
            payload = fh.read(MAX_FILE_BYTES + 1)
        result = parse_dat(payload, args.input.name)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=args.output.parent, delete=False) as fh:
            temp_name = fh.name
            json.dump(result, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(temp_name, args.output)
        temp_name = None
        print(f"Imported {result['levelCount']} level records into {args.output}")
        print(f"SHA256: {result['sourceSha256']}; structural validation only")
        return 0
    except (DatError, OSError, ValueError) as exc:
        print(f"Import failed: {exc}", file=sys.stderr)
        return 2
    finally:
        if temp_name:
            Path(temp_name).unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
