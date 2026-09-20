from pathlib import Path
import stat
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from io import BytesIO

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fetch_resources import ResourceError, fetch, inspect_zip, validate_url


class ResourceTests(unittest.TestCase):
    def test_allow_https(self):
        self.assertEqual(validate_url("https://bitbusters.club/cclp1/CCLP1.dat"),"https://bitbusters.club/cclp1/CCLP1.dat")

    def test_reject_urls(self):
        for url in ["http://bitbusters.club/a", "https://evil.example/a", "https://bitbusters.club.evil.example/a",
                    "file:///etc/passwd", "https://x:y@bitbusters.club/a", "https://bitbusters.club:8000/a",
                    "https://127.0.0.1/a", "https://bitbusters.club/a#x"]:
            with self.subTest(url=url), self.assertRaises(ResourceError): validate_url(url)

    def make_zip(self, path, name="CCLP1.dat", data=b"example"):
        with zipfile.ZipFile(path,"w") as f: f.writestr(name,data)

    def test_safe_zip(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)/"a.zip"
            self.make_zip(p)
            obj = inspect_zip(p)
            self.assertEqual(obj["entryCount"],1)
            self.assertEqual(obj["entries"][0]["kind"],"data")

    def test_archive_path_rejection(self):
        for name in ["../a.dat", "folder/../../a.dat", "/tmp/a.dat", "C:/a.dat", "folder\\..\\a.dat"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as td:
                p = Path(td)/"a.zip"
                self.make_zip(p,name)
                with self.assertRaises(ResourceError): inspect_zip(p)

    def test_symlink_rejection(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)/"a.zip"
            with zipfile.ZipFile(p,"w") as f:
                info = zipfile.ZipInfo("link")
                info.create_system = 3
                info.external_attr = (stat.S_IFLNK|0o777)<<16
                f.writestr(info,"target")
            with self.assertRaises(ResourceError): inspect_zip(p)

    def test_case_collision(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)/"a.zip"
            with zipfile.ZipFile(p,"w") as f:
                f.writestr("a.dat",b"a")
                f.writestr("A.dat",b"a")
            with self.assertRaises(ResourceError): inspect_zip(p)

    def test_suspicious_ratio(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)/"a.zip"
            with zipfile.ZipFile(p,"w",compression=zipfile.ZIP_DEFLATED) as f:
                f.writestr("huge.dat",b"x"*2_000_000)
            with self.assertRaises(ResourceError): inspect_zip(p)

    def test_executables_flagged_never_extracted(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)/"a.zip"
            self.make_zip(p,"run.exe",b"fake")
            self.assertTrue(inspect_zip(p)["entries"][0]["doNotExecute"])
            self.assertFalse((Path(td)/"run.exe").exists())

    def test_mocked_download_and_provenance(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            sample=root/"sample.zip"
            self.make_zip(sample,"credits.txt",b"Original test credits, not campaign data")
            class Response(BytesIO):
                headers={}
                def geturl(self): return "https://bitbusters.club/test.zip"
            class Opener:
                def open(self,req,timeout): return Response(sample.read_bytes())
            resource={"id":"test","url":"https://bitbusters.club/test.zip","filename":"test.zip","kind":"zip","maxBytes":10000}
            with patch("fetch_resources.build_opener",return_value=Opener()):
                obj=fetch(resource,root/"in")
            self.assertFalse(obj["redistributionApproved"])
            self.assertEqual(obj["bytes"],sample.stat().st_size)
            self.assertTrue((root/"in"/"test.zip.provenance.json").exists())

    def test_mocked_download_over_limit_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as td:
            class Response(BytesIO):
                headers={}
                def geturl(self): return "https://bitbusters.club/a.zip"
            class Opener:
                def open(self,req,timeout): return Response(b"x"*200)
            r={"id":"test","url":"https://bitbusters.club/a.zip","filename":"a.zip","kind":"zip","maxBytes":100}
            with patch("fetch_resources.build_opener",return_value=Opener()), self.assertRaises(ResourceError):
                fetch(r,Path(td))
            self.assertEqual(list(Path(td).iterdir()),[])

    def test_existing_file_not_overwritten(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"a.zip"
            p.write_bytes(b"keep")
            r={"id":"test","url":"https://bitbusters.club/a.zip","filename":"a.zip","kind":"zip"}
            with self.assertRaises(ResourceError): fetch(r,Path(td))
            self.assertEqual(p.read_bytes(),b"keep")

    def test_manifest_filename_rejected(self):
        r={"id":"test","url":"https://bitbusters.club/a.zip","filename":"../a.zip","kind":"zip"}
        with tempfile.TemporaryDirectory() as td, self.assertRaises(ResourceError): fetch(r,Path(td))


if __name__ == "__main__": unittest.main()
