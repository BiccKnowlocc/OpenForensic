"""One job per subprocess; emit bounded JSONL into a derivative, never alter evidence."""
from __future__ import annotations
import argparse
import json
import sys
import tarfile
import shutil
from pathlib import Path, PurePosixPath
from carver_sqlite import carve
from normalizers import provider, sqlite_messages, json_messages
from formats import preferences, protobuf_wire

VERSION = "0.1.0"
MAX_OUTPUT_BYTES = 256 * 1024 * 1024
MAX_ARCHIVE_BYTES = 4 * 1024 ** 3
MAX_ARCHIVE_FILE = 512 * 1024 * 1024
MAX_ROWS = 250000

def extract_archive(path: Path, destination: Path, warnings: list[str]):
    destination.mkdir(mode=0o700)
    total = 0
    files = []
    with tarfile.open(path, "r|") as archive:
        for index, member in enumerate(archive):
            if index >= 100000:
                raise ValueError("Archive member limit reached")
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or "\\" in member.name or ":" in member.name:
                raise ValueError("Unsafe archive path")
            if member.isdir():
                continue
            if not member.isfile():
                warnings.append(f"Archive link/special member excluded: {member.name}")
                continue
            total += member.size
            if member.size > MAX_ARCHIVE_FILE or total > MAX_ARCHIVE_BYTES:
                raise ValueError("Archive extraction size limit reached")
            target = destination.joinpath(*name.parts)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            source = archive.extractfile(member)
            if source is None:
                raise ValueError("Missing archive payload")
            with source, target.open("xb") as output:
                shutil.copyfileobj(source, output, 1024 * 1024)
            files.append(target)
    return files

def parse_file(path: Path, kind: str, warnings: list[str]):
    suffix = path.suffix.lower()
    with path.open("rb") as source:
        header = source.read(16)
    if kind.startswith("provider-"):
        yield from provider(path, kind, warnings)
    elif header == b"SQLite format 3\x00":
        try:
            yield from sqlite_messages(path, warnings)
        except Exception as error:
            warnings.append(f"{path.name}: live SQLite parsing failed: {error}")
        yield from carve(path, warnings)
    elif suffix == ".json":
        yield from json_messages(path, warnings)
    elif suffix == ".xml":
        yield {"type": "auxiliary", "kind": "shared-preferences", "source_locator": path.name,
               "data_json": json.dumps(preferences(path), ensure_ascii=False, allow_nan=False)}
    elif suffix in (".pb", ".protobuf", ".bin"):
        if path.stat().st_size > 16 * 1024 * 1024:
            raise ValueError("Protobuf file too large")
        yield {"type": "auxiliary", "kind": "protobuf-wire", "source_locator": path.name,
               "data_json": json.dumps({"fields": protobuf_wire(path.read_bytes()), "interpretation": "Field numbers only; schema-free wire decoding does not infer message meaning."}, ensure_ascii=False)}
    elif suffix not in (".jpg", ".jpeg", ".png", ".webp", ".mp4", ".m4a", ".mp3", ".ogg", ".wav", ".amr", ".webm") and not path.name.endswith(("-wal", "-shm")):
        warnings.append(f"{path.name}: unsupported artifact; preserved without semantic parsing")

def run(input_path: Path, kind: str, output_path: Path, work: Path):
    warnings = []
    messages = candidates = rows = written = 0
    files = extract_archive(input_path, work / "unpacked", warnings) if kind == "tar" else [input_path]
    with output_path.open("x", encoding="utf-8", newline="\n") as output:
        for path in files:
            try:
                prefix = path.relative_to(work).as_posix()
                for entry in parse_file(path, kind if path == input_path else "file", warnings):
                    locator = entry["source_locator"]
                    if locator.startswith(path.name + ":"):
                        locator = locator[len(path.name) + 1:]
                    elif locator == path.name:
                        locator = ""
                    entry["source_locator"] = prefix + (":" + locator if locator else "")
                    media = entry.get("media_path")
                    if media:
                        media_parts = PurePosixPath(str(media))
                        if not media_parts.is_absolute() and ".." not in media_parts.parts and "\\" not in str(media) and ":" not in str(media):
                            options = [path.parent.joinpath(*media_parts.parts), work / "unpacked" / media_parts]
                            found = next((v for v in options if v.is_file()), None)
                            entry["media_path"] = found.relative_to(work).as_posix() if found else None
                        else:
                            entry["media_path"] = None
                        entry["original_media_reference"] = str(media)
                    line = json.dumps(entry, ensure_ascii=False, allow_nan=False) + "\n"
                    written += len(line.encode("utf-8")); rows += 1
                    if written > MAX_OUTPUT_BYTES or rows > MAX_ROWS:
                        raise ValueError("Parser output limit reached")
                    output.write(line)
                    messages += entry["type"] == "message"
                    candidates += entry["type"] == "candidate"
            except Exception as error:
                if "output limit" in str(error):
                    raise
                warnings.append(f"{path.name}: {type(error).__name__}: {error}")
        output.write(json.dumps({"type": "summary", "version": VERSION, "messages": messages, "candidates": candidates, "warnings": warnings[:5000]}, ensure_ascii=False) + "\n")
    return {"messages": messages, "candidates": candidates, "warnings": warnings[:5000], "version": VERSION}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--kind", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--work", required=True)
    args = parser.parse_args()
    try:
        result = run(Path(args.input), args.kind, Path(args.output), Path(args.work))
        print(json.dumps(result, ensure_ascii=True))
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
