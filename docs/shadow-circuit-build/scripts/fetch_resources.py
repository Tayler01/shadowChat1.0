#!/usr/bin/env python3
"""Download only reviewed manifest resources; inspect ZIP metadata without execution.

Python 3.10+ standard library. Network success and source permissions are separate
from this tool's integrity/format checks. Does not extract archives or grant rights.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import sys
import tempfile
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_HOSTS = frozenset({"bitbusters.club", "raw.githubusercontent.com"})
MAX_ARCHIVE_ENTRIES = 4096
MAX_EXPANDED_BYTES = 64 * 1024 * 1024
MAX_ARCHIVE_BYTES = 16 * 1024 * 1024


class ResourceError(ValueError):
    pass


def validate_url(url: str) -> str:
    p = urlsplit(url)
    if p.scheme != "https" or p.hostname not in ALLOWED_HOSTS or p.username or p.password or p.port not in {None, 443}:
        raise ResourceError("only HTTPS URLs on the reviewed resource hosts are allowed")
    if p.fragment:
        raise ResourceError("resource URLs cannot contain fragments")
    return url


class ReviewedRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def inspect_zip(path: Path) -> dict:
    if path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ResourceError("archive exceeds 16 MiB input cap")
    entries = []
    total = 0
    names: set[str] = set()
    with zipfile.ZipFile(path) as archive:
        items = archive.infolist()
        if len(items) > MAX_ARCHIVE_ENTRIES:
            raise ResourceError("too many ZIP entries")
        for item in items:
            name = item.filename
            normalized = name.replace("\\", "/")
            parts = PurePosixPath(normalized).parts
            if not name or normalized.startswith("/") or any(x in {"..", "."} for x in parts) or ":" in normalized or "\x00" in normalized:
                raise ResourceError("unsafe archive path")
            # No extraction here, but reject case-insensitive collisions for Windows users.
            key = normalized.rstrip("/").casefold()
            if key in names:
                raise ResourceError("duplicate/case-colliding archive path")
            names.add(key)
            mode = (item.external_attr >> 16) & 0xFFFF
            if stat.S_ISLNK(mode):
                raise ResourceError("archive symlinks are not allowed")
            if item.flag_bits & 1:
                raise ResourceError("encrypted archive entries are not accepted")
            total += item.file_size
            if item.file_size > MAX_ARCHIVE_BYTES or total > MAX_EXPANDED_BYTES:
                raise ResourceError("archive expanded-size limit exceeded")
            if item.file_size > 1_000_000 and item.file_size / max(1, item.compress_size) > 200:
                raise ResourceError("suspicious archive compression ratio")
            suffix = PurePosixPath(normalized).suffix.lower()
            entries.append({"path": name, "bytes": item.file_size, "compressedBytes": item.compress_size,
                            "kind": "data" if suffix in {".dat", ".ccl", ".tws"} else "review-only",
                            "doNotExecute": suffix in {".exe", ".dll", ".bat", ".cmd", ".ps1", ".js", ".vbs", ".scr", ".msi"}})
    return {"archive": path.name, "entryCount": len(entries), "expandedBytes": total, "entries": entries,
            "note": "Metadata inspected only. No extraction, execution, permission approval or full data CRC verification."}


def fetch(resource: dict, incoming: Path) -> dict:
    url = validate_url(resource["url"])
    name = resource["filename"]
    if Path(name).name != name or any(c in name for c in "\\/:"):
        raise ResourceError("manifest filename must be a single safe basename")
    limit = min(int(resource.get("maxBytes", MAX_ARCHIVE_BYTES)), MAX_ARCHIVE_BYTES)
    if limit <= 0:
        raise ResourceError("invalid byte limit")
    incoming.mkdir(parents=True, exist_ok=True)
    target = incoming / name
    if target.exists():
        raise ResourceError(f"{target} already exists; inspect it or choose another output directory")
    tmp: str | None = None
    try:
        opener = build_opener(ReviewedRedirects())
        req = Request(url, headers={"User-Agent": "ShadowCircuitResourceAudit/1.0", "Accept-Encoding": "identity"})
        with opener.open(req, timeout=30) as response:
            validate_url(response.geturl())
            raw_length = response.headers.get("Content-Length")
            if raw_length and int(raw_length) > limit:
                raise ResourceError("server response exceeds byte limit")
            length = 0
            with tempfile.NamedTemporaryFile("wb", dir=incoming, delete=False) as fh:
                tmp = fh.name
                while True:
                    chunk = response.read(min(65536, limit - length + 1))
                    if not chunk:
                        break
                    length += len(chunk)
                    if length > limit:
                        raise ResourceError("download exceeds byte limit")
                    fh.write(chunk)
        blob = Path(tmp).read_bytes()
        if not blob:
            raise ResourceError("empty download")
        sha = hashlib.sha256(blob).hexdigest()
        git_sha = hashlib.sha1(b"blob " + str(len(blob)).encode("ascii") + b"\0" + blob).hexdigest()
        if resource.get("expectedSha256") and sha != resource["expectedSha256"]:
            raise ResourceError("SHA256 differs from expected manifest value")
        if resource.get("expectedGitBlobSha1") and git_sha != resource["expectedGitBlobSha1"]:
            raise ResourceError("Git blob hash differs from reviewed repository observation; review upstream change")
        if resource["kind"] == "zip":
            inspected = inspect_zip(Path(tmp))
            inspected["archive"] = name
        elif resource["kind"] == "legacy-dat":
            from import_legacy_dat import parse_dat
            parsed = parse_dat(blob, name)
            inspected = {"levelCount": parsed["levelCount"], "rulesetHint": parsed["rulesetHint"], "structuralOnly": True}
        else:
            raise ResourceError("unknown resource kind")
        os.replace(tmp, target)
        tmp = None
        report = {"resourceId": resource["id"], "url": url, "path": str(target), "bytes": length,
                  "sha256": sha, "gitBlobSha1": git_sha, "retrievedAt": datetime.now(timezone.utc).isoformat(),
                  "redistributionApproved": False, "licenseStatus": "REVIEW_REQUIRED", "inspection": inspected}
        report_path = target.with_name(target.name + ".provenance.json")
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return report
    finally:
        if tmp:
            Path(tmp).unlink(missing_ok=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", action="store_true")
    group.add_argument("--resource")
    group.add_argument("--inspect-archive", type=Path)
    ap.add_argument("--output-dir", type=Path, default=ROOT / "resources" / "incoming")
    args = ap.parse_args()
    try:
        resources = json.loads((ROOT / "manifests" / "resources.json").read_text(encoding="utf-8"))["resources"]
        if args.list:
            for item in resources:
                print(f"{item['id']}: {item['url']} [{item['licenseStatus']}]")
        elif args.inspect_archive:
            print(json.dumps(inspect_zip(args.inspect_archive), indent=2))
        else:
            found = next((x for x in resources if x["id"] == args.resource), None)
            if not found:
                raise ResourceError("unknown resource ID; run --list")
            print(json.dumps(fetch(found, args.output_dir), indent=2))
        return 0
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as exc:
        print(f"Resource operation failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
