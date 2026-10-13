"""Bounded SharedPreferences XML and schema-free Protobuf wire decoding."""
from __future__ import annotations
import base64
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

MAX_FORMAT_BYTES = 16 * 1024 * 1024

def varint(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    for index in range(10):
        if offset >= len(data):
            raise ValueError("Truncated Protobuf varint")
        byte = data[offset]
        offset += 1
        if index == 9 and byte > 1:
            raise ValueError("Protobuf varint exceeds 64 bits")
        value |= (byte & 127) << (7 * index)
        if byte < 128:
            return value, offset
    raise ValueError("Invalid Protobuf varint")

def preferences(path: Path) -> dict:
    if path.stat().st_size > MAX_FORMAT_BYTES:
        raise ValueError("XML exceeds 16 MiB limit")
    data = path.read_bytes()
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("DTD and entity declarations are disallowed")
    root = ET.fromstring(data)
    if root.tag != "map":
        raise ValueError("Expected SharedPreferences map")
    result = {}
    for node in root:
        key = node.attrib.get("name", "")
        if node.tag == "set":
            value = [child.text or "" for child in node]
        elif node.tag in ("int", "long"):
            value = int(node.attrib["value"])
        elif node.tag == "float":
            value = float(node.attrib["value"])
        elif node.tag == "boolean":
            value = node.attrib.get("value") == "true"
        else:
            value = node.text or ""
        result[key] = value
    return result

def protobuf_wire(data: bytes) -> list[dict]:
    if len(data) > MAX_FORMAT_BYTES:
        raise ValueError("Protobuf exceeds 16 MiB limit")
    position = 0
    fields = []
    while position < len(data):
        tag, position = varint(data, position)
        number, wire = tag >> 3, tag & 7
        if number == 0 or number > 536870911:
            raise ValueError("Invalid Protobuf field number")
        if wire == 0:
            value, position = varint(data, position)
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            if position + size > len(data):
                raise ValueError("Truncated fixed Protobuf field")
            value = int.from_bytes(data[position:position + size], "little")
            position += size
        elif wire == 2:
            size, position = varint(data, position)
            if position + size > len(data):
                raise ValueError("Truncated Protobuf bytes")
            raw = data[position:position + size]
            position += size
            value = {"bytes_base64": base64.b64encode(raw).decode(), "length": size}
            try:
                value["utf8"] = raw.decode("utf-8")
            except UnicodeError:
                pass
        else:
            raise ValueError(f"Unsupported group or wire type {wire}; a schema is required")
        fields.append({"field_number": number, "wire_type": wire, "value": value})
        if len(fields) > 100000:
            raise ValueError("Protobuf field limit exceeded")
    return fields
