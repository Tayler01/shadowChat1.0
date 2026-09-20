"""Original synthetic fixtures. No source campaign content included."""
from pathlib import Path
import struct
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from import_legacy_dat import DatError, decode_layer, parse_dat


def rle(cells: list[int]) -> bytes:
    out = bytearray()
    i = 0
    while i < len(cells):
        j = i + 1
        while j < len(cells) and cells[j] == cells[i] and j - i < 255:
            j += 1
        count = j - i
        if count > 2:
            out.extend((255, count, cells[i]))
        else:
            out.extend(cells[i:j])
        i = j
    return bytes(out)


def tlv(kind: int, payload: bytes) -> bytes:
    return bytes((kind, len(payload))) + payload


def make_record(*, number=1, timer=60, chips=1, encoding=1, upper=None, lower=None, fields=None) -> bytes:
    if upper is None:
        cells = [1] * 1024
        for x, tile in enumerate([0x6F, 2, 0x65, 0x17, 0x15], start=2):
            cells[2 * 32 + x] = tile
        upper = rle(cells)
    if lower is None:
        lower = rle([0] * 1024)
    if fields is None:
        fields = tlv(3, b"Synthetic corridor\0") + tlv(6, bytes(x ^ 0x99 for x in b"A001") + b"\0")
    record = struct.pack("<4H", number, timer, chips, encoding)
    record += struct.pack("<H", len(upper)) + upper
    record += struct.pack("<H", len(lower)) + lower
    record += struct.pack("<H", len(fields)) + fields
    return struct.pack("<H", len(record)) + record


def make_dat(records=None, magic=0x0002AAAC) -> bytes:
    if records is None:
        records = [make_record()]
    return struct.pack("<IH", magic, len(records)) + b"".join(records)


class DatTests(unittest.TestCase):
    def test_valid_synthetic_corridor(self):
        obj = parse_dat(make_dat())
        self.assertEqual(obj["levelCount"], 1)
        self.assertEqual(obj["levels"][0]["upper"][66:71], [0x6F, 2, 0x65, 0x17, 0x15])
        self.assertEqual(obj["levels"][0]["optionalFields"][1]["text"], "A001")

    def test_source_record_round_trip(self):
        original = make_dat([make_record(number=3), make_record(number=5)])
        obj = parse_dat(original)
        restored = struct.pack("<IH", int(obj["magicHex"], 16), obj["levelCount"])
        for item in obj["levels"]:
            record = bytes.fromhex(item["recordRawHex"])
            restored += struct.pack("<H", len(record)) + record
        self.assertEqual(restored, original)

    def test_all_truncations_rejected(self):
        data = make_dat()
        for n in range(len(data)):
            with self.subTest(n=n), self.assertRaises(DatError):
                parse_dat(data[:n])

    def test_invalid_header(self):
        with self.assertRaises(DatError): parse_dat(make_dat(magic=1))

    def test_lynx_hint(self):
        obj = parse_dat(make_dat(magic=0x0102AAAC))
        self.assertEqual(obj["rulesetHint"], "lynx-hint")
        self.assertTrue(obj["warnings"])

    def test_empty_pack(self):
        with self.assertRaises(DatError): parse_dat(make_dat([]))

    def test_count_limit(self):
        with self.assertRaises(DatError): parse_dat(struct.pack("<IH", 0x0002AAAC, 4097))

    def test_oversize_file(self):
        with self.assertRaises(DatError): parse_dat(b"0" * (16*1024*1024+1))

    def test_trailing_bytes_rejected(self):
        with self.assertRaises(DatError): parse_dat(make_dat() + b"x")

    def test_unsupported_encoding(self):
        with self.assertRaises(DatError): parse_dat(make_dat([make_record(encoding=0)]))

    def test_record_extra_bytes(self):
        record = make_record()
        broken = struct.pack("<H", len(record)-1) + record[2:] + b"x"
        with self.assertRaises(DatError): parse_dat(make_dat([broken]))

    def test_layer_short(self):
        with self.assertRaises(DatError): decode_layer(bytes([0])*1023)

    def test_layer_overflow(self):
        with self.assertRaises(DatError): decode_layer(bytes([0])*1025)

    def test_zero_run(self):
        with self.assertRaises(DatError): decode_layer(bytes([255, 0, 0]))

    def test_run_truncated(self):
        with self.assertRaises(DatError): decode_layer(bytes([255, 8]))

    def test_invalid_tile_literal(self):
        with self.assertRaises(DatError): decode_layer(bytes([0x70])*1024)

    def test_invalid_tile_run(self):
        with self.assertRaises(DatError): decode_layer(bytes([255, 1, 0x70]))

    def test_valid_literal_layer(self):
        self.assertEqual(decode_layer(bytes([0])*1024), [0]*1024)

    def test_max_run_chain(self):
        self.assertEqual(decode_layer(bytes([255,255,0])*4+bytes([255,4,0])), [0]*1024)

    def test_internal_tiles_preserved_warning(self):
        obj = parse_dat(make_dat([make_record(upper=rle([0x39]*1024))]))
        self.assertEqual(obj["levels"][0]["upper"][0], 0x39)
        self.assertTrue(obj["levels"][0]["warnings"])

    def test_duplicate_level_number_preserved(self):
        obj = parse_dat(make_dat([make_record(),make_record()]))
        self.assertTrue(obj["levels"][1]["warnings"])
        self.assertEqual(obj["levels"][1]["recordIndex"],1)

    def test_optional_links(self):
        fields = tlv(4, struct.pack("<5H",1,2,3,4,123)) + tlv(5, struct.pack("<4H",6,7,8,9))
        obj = parse_dat(make_dat([make_record(fields=fields)]))["levels"][0]
        self.assertEqual(obj["optionalFields"][0]["links"][0]["legacyState"],123)
        self.assertEqual(obj["optionalFields"][1]["links"][0]["target"],[8,9])

    def test_bad_link_coordinates(self):
        with self.assertRaises(DatError):
            parse_dat(make_dat([make_record(fields=tlv(5,struct.pack("<4H",32,0,0,0)))]))

    def test_bad_link_record_width(self):
        with self.assertRaises(DatError): parse_dat(make_dat([make_record(fields=tlv(4,b"123"))]))

    def test_order_not_sorted(self):
        obj = parse_dat(make_dat([make_record(fields=tlv(10,bytes([5,6,1,2])))]))
        self.assertEqual(obj["levels"][0]["optionalFields"][0]["actorOrder"], [[5,6],[1,2]])

    def test_order_bad_coordinates(self):
        with self.assertRaises(DatError): parse_dat(make_dat([make_record(fields=tlv(10,bytes([32,0])))]))

    def test_odd_actor_bytes(self):
        with self.assertRaises(DatError): parse_dat(make_dat([make_record(fields=tlv(10,b"x"))]))

    def test_unknown_optional_bytes(self):
        fields = tlv(245,bytes([255,0,18]))
        obj = parse_dat(make_dat([make_record(fields=fields)]))
        self.assertEqual(obj["levels"][0]["optionalFields"][0]["rawHex"],"ff0012")

    def test_duplicate_optional_preserved(self):
        obj = parse_dat(make_dat([make_record(fields=tlv(3,b"A\0")+tlv(3,b"B\0"))]))
        self.assertEqual(len(obj["levels"][0]["optionalFields"]),2)
        self.assertTrue(obj["levels"][0]["warnings"])

    def test_untimed(self):
        self.assertEqual(parse_dat(make_dat([make_record(timer=0)]))["levels"][0]["timeLimitSeconds"],0)

    def test_text_cp1252_raw(self):
        obj = parse_dat(make_dat([make_record(fields=tlv(3,b"Caf\xe9\0"))]))
        self.assertEqual(obj["levels"][0]["optionalFields"][0]["text"],"Café")
        self.assertEqual(obj["levels"][0]["optionalFields"][0]["rawHex"],"436166e900")

    def test_missing_nul_is_warning(self):
        obj = parse_dat(make_dat([make_record(fields=tlv(3,b"name"))]))
        self.assertTrue(obj["levels"][0]["warnings"])

    def test_bytes_required(self):
        with self.assertRaises(TypeError): parse_dat("string")


if __name__ == "__main__":
    unittest.main()
