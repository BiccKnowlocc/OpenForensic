"""Conservative SQLite page and WAL inspection. Recovered values are candidates, not facts."""
from __future__ import annotations
import mmap
import struct
from pathlib import Path
from typing import Iterator, Any

MAX_CANDIDATES = 10000

def varint(data: bytes, offset: int, end: int | None = None) -> tuple[int, int]:
    end = len(data) if end is None else end
    value = 0
    for index in range(9):
        if offset >= end:
            raise ValueError("Truncated varint")
        byte = data[offset]
        offset += 1
        if index == 8:
            return (value << 8) | byte, offset
        value = (value << 7) | (byte & 127)
        if byte < 128:
            return value, offset
    raise ValueError("Invalid varint")

def serial_size(serial: int) -> int:
    if serial in (10, 11) or serial < 0:
        raise ValueError("Reserved serial type")
    if serial < 12:
        return (0, 1, 2, 3, 4, 6, 8, 8, 0, 0)[serial]
    return (serial - 12) // 2

def record(data: bytes, offset: int, end: int, encoding: str = "utf-8") -> tuple[list[Any], int]:
    header_size, position = varint(data, offset, end)
    if not 2 <= header_size <= 4096 or offset + header_size > end:
        raise ValueError("Record header bounds")
    header_end = offset + header_size
    serials = []
    while position < header_end:
        serial, position = varint(data, position, header_end)
        serial_size(serial)
        serials.append(serial)
        if len(serials) > 512:
            raise ValueError("Too many columns")
    if position != header_end or not serials:
        raise ValueError("Invalid record header")
    position = header_end
    values = []
    for serial in serials:
        size = serial_size(serial)
        if position + size > end:
            raise ValueError("Overflow or incomplete record")
        raw = data[position:position + size]
        position += size
        if serial == 0:
            value = None
        elif serial in (8, 9):
            value = serial - 8
        elif serial == 7:
            value = struct.unpack(">d", raw)[0]
            if value != value or abs(value) == float("inf"):
                value = {"float_hex": raw.hex()}
        elif serial < 7:
            value = int.from_bytes(raw, "big", signed=True)
        elif serial % 2:
            value = raw.decode(encoding, errors="strict")
        else:
            value = {"blob_hex": raw[:4096].hex(), "bytes": size}
        values.append(value)
    return values, position

def leaf_cells(page: bytes, usable: int, encoding: str, header: int = 0):
    if header + 8 > len(page) or page[header] != 13:
        return
    count = int.from_bytes(page[header + 3:header + 5], "big")
    if header + 8 + 2 * count > usable:
        return
    for index in range(count):
        pointer = int.from_bytes(page[header + 8 + 2 * index:header + 10 + 2 * index], "big")
        if pointer < header + 8 + 2 * count or pointer >= usable:
            continue
        try:
            payload, position = varint(page, pointer, usable)
            rowid, position = varint(page, position, usable)
            if payload > usable - 35 or position + payload > usable:
                continue  # Overflow chains are intentionally excluded from candidate reconstruction.
            values, end = record(page, position, position + payload, encoding)
            if end != position + payload:
                continue
            if rowid >= 1 << 63:
                rowid -= 1 << 64
            yield pointer, end, rowid, values, page[pointer:end]
        except (ValueError, UnicodeError, struct.error):
            continue

def candidate(locator: str, origin: str, values: list[Any], raw: bytes, confidence: str, note: str) -> dict:
    if len(raw) > 4096:
        note += f" Raw hex is limited to the first 4096 of {len(raw)} cell bytes; consult the preserved source for the remainder."
    return {"type": "candidate", "source_locator": locator, "origin": origin, "confidence": confidence,
            "values_json": __import__("json").dumps(values, ensure_ascii=False), "raw_hex": raw[:4096].hex(), "note": note}

def scan_region(page: bytes, start: int, end: int, encoding: str):
    position = max(0, start)
    while position + 8 <= end:
        try:
            values, finish = record(page, position, end, encoding)
            texts = [v for v in values if isinstance(v, str) and len(v) >= 4]
            if len(values) >= 2 and finish - position >= 12 and texts and all(
                sum(c.isprintable() or c in "\r\n\t" for c in t) / len(t) >= .95 for t in texts
            ):
                yield position, values, page[position:finish]
                position = finish
                continue
        except (ValueError, UnicodeError, struct.error):
            pass
        position += 1

def checksum(data: bytes, state: tuple[int, int], endian: str) -> tuple[int, int]:
    if len(data) % 8:
        raise ValueError("WAL checksum alignment")
    a, b = state
    for x, y in struct.iter_unpack(endian + "II", data):
        a = (a + x + b) & 0xFFFFFFFF
        b = (b + y + a) & 0xFFFFFFFF
    return a, b

def wal_frames(path: Path, expected_page_size: int, warnings: list[str]):
    with path.open("rb") as source:
        header = source.read(32)
        if len(header) != 32:
            warnings.append(f"{path.name}: incomplete WAL header")
            return
        magic, version, size, _, salt1, salt2, c1, c2 = struct.unpack(">8I", header)
        if magic not in (0x377F0682, 0x377F0683) or version != 3007000 or size != expected_page_size:
            warnings.append(f"{path.name}: invalid or mismatched WAL header")
            return
        endian = "<" if magic == 0x377F0682 else ">"
        state = checksum(header[:24], (0, 0), endian)
        if state != (c1, c2):
            warnings.append(f"{path.name}: header checksum failure")
            return
        frame = 0
        while True:
            offset = source.tell()
            fh = source.read(24)
            if not fh:
                break
            page = source.read(size)
            if len(fh) != 24 or len(page) != size:
                warnings.append(f"{path.name}: incomplete frame at byte {offset}")
                break
            number, commit, s1, s2, f1, f2 = struct.unpack(">6I", fh)
            state = checksum(fh[:8] + page, state, endian)
            if (s1, s2) != (salt1, salt2) or state != (f1, f2) or not number:
                warnings.append(f"{path.name}: invalid salt/checksum/page at byte {offset}; remaining frames excluded")
                break
            frame += 1
            yield frame, number, commit, offset + 24, page

def carve(path: Path, warnings: list[str]) -> Iterator[dict]:
    with path.open("rb") as source:
        if path.stat().st_size < 100:
            warnings.append(f"{path.name}: too short to be SQLite")
            return
        with mmap.mmap(source.fileno(), 0, access=mmap.ACCESS_READ) as mapped:
            if mapped[:16] != b"SQLite format 3\x00":
                warnings.append(f"{path.name}: unsupported encrypted or non-SQLite file")
                return
            size = int.from_bytes(mapped[16:18], "big")
            size = 65536 if size == 1 else size
            if size < 512 or size > 65536 or size & (size - 1):
                warnings.append(f"{path.name}: invalid page size")
                return
            usable = size - mapped[20]
            encoding = {1: "utf-8", 2: "utf-16le", 3: "utf-16be"}.get(int.from_bytes(mapped[56:60], "big"), "utf-8")
            pages = len(mapped) // size
            trunk = int.from_bytes(mapped[32:36], "big")
            seen = set()
            free_pages = set()
            while trunk:
                if trunk in seen or not 1 <= trunk <= pages:
                    warnings.append(f"{path.name}: invalid freelist link {trunk}")
                    break
                seen.add(trunk)
                start = (trunk - 1) * size
                page = mapped[start:start + size]
                next_trunk, count = struct.unpack(">II", page[:8])
                if count > usable // 4 - 2:
                    warnings.append(f"{path.name}: invalid freelist count on page {trunk}")
                    break
                for index in range(count):
                    number = int.from_bytes(page[8 + index * 4:12 + index * 4], "big")
                    if 1 <= number <= pages and number not in seen:
                        free_pages.add(number)
                trunk = next_trunk
            free_pages.difference_update(seen)
            count = 0
            for number in range(1, pages + 1):
                start = (number - 1) * size
                page = mapped[start:start + size]
                header = 100 if number == 1 else 0
                if number in free_pages:
                    cells = list(leaf_cells(page, usable, encoding, header))
                    for pointer, _, rowid, values, raw in cells:
                        yield candidate(f"{path.name}:page={number}:offset={start + pointer}:rowid={rowid}", "freelist_leaf", values, raw,
                                        "medium", "Freelist page contains an intact table-leaf cell. Table identity and deletion time are unknown.")
                        count += 1
                    if not cells:
                        for pointer, values, raw in scan_region(page, 8, usable, encoding):
                            yield candidate(f"{path.name}:page={number}:offset={start + pointer}", "freelist_fragment", values, raw,
                                            "low", "Heuristic intact record header in a free page. False positives are possible; no schema attribution.")
                            count += 1
                elif page[header] == 13:
                    cells_count = int.from_bytes(page[header + 3:header + 5], "big")
                    lower = header + 8 + cells_count * 2
                    upper = int.from_bytes(page[header + 5:header + 7], "big") or 65536
                    regions = [(lower, min(upper, usable))] if lower <= upper <= usable else []
                    block = int.from_bytes(page[header + 1:header + 3], "big")
                    blocks_seen = set()
                    while block and block not in blocks_seen and lower <= block <= usable - 4:
                        blocks_seen.add(block)
                        next_block, length = struct.unpack(">HH", page[block:block + 4])
                        if length < 4 or block + length > usable:
                            break
                        regions.append((block + 4, block + length))
                        block = next_block
                    for lower, upper in regions:
                        for pointer, values, raw in scan_region(page, lower, upper, encoding):
                            yield candidate(f"{path.name}:page={number}:offset={start + pointer}", "unallocated_fragment", values, raw,
                                            "low", "Intact record header in unallocated/freeblock bytes. Overwritten headers and overflow chains are not reconstructed.")
                            count += 1
                if count >= MAX_CANDIDATES:
                    warnings.append(f"{path.name}: candidate limit reached ({MAX_CANDIDATES})")
                    return
            wal = Path(str(path) + "-wal")
            if wal.exists():
                last_commit = 0
                for frame, _, commit, _, _ in wal_frames(wal, size, warnings):
                    if commit:
                        last_commit = frame
                for frame, number, _, offset, page in wal_frames(wal, size, []):
                    origin = "wal_committed" if frame <= last_commit else "wal_uncommitted"
                    for pointer, _, rowid, values, raw in leaf_cells(page, usable, encoding, 100 if number == 1 else 0):
                        yield candidate(f"{wal.name}:frame={frame}:page={number}:offset={offset + pointer}:rowid={rowid}", origin, values, raw,
                                        "medium" if frame <= last_commit else "low",
                                        "Valid WAL frame with intact leaf record. A WAL version does not prove deletion; it may also exist in live data.")
                        count += 1
                        if count >= MAX_CANDIDATES:
                            warnings.append(f"{path.name}: WAL candidate limit reached")
                            return
