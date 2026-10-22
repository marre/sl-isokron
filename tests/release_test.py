import hashlib
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from release_data import fetch, install, pack, validate
from convert_contours import convert
from contour_format import decode_profiles, equivalent


class ReleaseTests(unittest.TestCase):
    def fixture(self, root):
        version = 'sl-' + 'a' * 20
        directory = root / version
        directory.mkdir(parents=True)
        raw = b'[]'
        (directory / 'index.json').write_bytes(raw)
        ref = dict(url=f'/data/{version}/index.json', bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        manifest = dict(schema=2, version=version, demo=False, validFrom='2026-10-19', validTo='2026-10-26',
                        days={'2026-10-19': [ref]}, **{key: ref for key in ('stops', 'walks', 'routes', 'transfers', 'trips')})
        (root / 'manifest.json').write_text(json.dumps(manifest))
        return manifest

    def test_contour_migration_preserves_transit_and_previous_clients(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'data';m=self.fixture(root);previous=m['version']
            native={'a':[dict(minutes=1,geometry=dict(type='Polygon',coordinates=[]))]}
            raw=json.dumps(native).encode();name='areas-0000.json'
            (root/previous/name).write_bytes(raw)
            (root/previous/'report.json').write_text(json.dumps(dict(generator='sliso-data-v2',version=previous)))
            m['walkingAreas']=dict(stepMinutes=1,index={'a':0},files=[dict(url='/data/'+previous+'/'+name,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())],reviewed=False)
            (root/'manifest.json').write_text(json.dumps(m))
            migrated=convert(root)
            self.assertNotEqual(previous,migrated['version'])
            self.assertEqual(m['stops']['sha256'],migrated['stops']['sha256'])
            self.assertEqual((root/previous/name).read_bytes(),raw)
            binary=root/migrated['walkingAreas']['files'][0]['url'].removeprefix('/data/')
            self.assertTrue(equivalent(native,decode_profiles(binary.read_bytes())))
            release=pack(root,Path(temp)/'data.zip',Path(temp)/'release.json','marre/sl-isokron')
            installed=Path(temp)/'installed';install(Path(temp)/'data.zip',release,installed)
            self.assertEqual(validate(installed),migrated)
            self.assertTrue((installed/previous/name).exists())

    def test_pinned_bundle_is_repeatable_and_installs_without_source_or_secrets(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            manifest = self.fixture(base / 'source')
            release = pack(base / 'source', base / 'sliso-data.zip', base / 'release.json', 'marre/sl-isokron')
            repeated = pack(base / 'source', base / 'second.zip', base / 'second.json', 'marre/sl-isokron')
            self.assertEqual(release['sha256'], repeated['sha256'])
            self.assertEqual(install(base / 'sliso-data.zip', release, base / 'public/data'), manifest)
            self.assertEqual(install(base / 'sliso-data.zip', release, base / 'public/data'), manifest)
            fetch(base / 'missing-descriptor.json', base / 'public/data')  # keep existing local data

    def test_bad_checksum_and_version_leave_the_previous_manifest_untouched(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            self.fixture(base / 'source')
            release = pack(base / 'source', base / 'sliso-data.zip', base / 'release.json', 'marre/sl-isokron')
            output = base / 'public/data'
            output.mkdir(parents=True)
            previous = b'{"previous":"keep"}'
            (output / 'manifest.json').write_bytes(previous)
            for bad in [{**release, 'sha256': '0' * 64}, {**release, 'version': 'sl-' + 'b' * 20}]:
                with self.assertRaises(ValueError):
                    install(base / 'sliso-data.zip', bad, output)
                self.assertEqual((output / 'manifest.json').read_bytes(), previous)

    def test_archive_cannot_escape_data_directory_even_with_a_matching_zip_checksum(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            archive = base / 'bad.zip'
            with zipfile.ZipFile(archive, 'w') as zipped:
                zipped.writestr('../escape.txt', 'invalid')
            release = dict(bytes=archive.stat().st_size, sha256=hashlib.sha256(archive.read_bytes()).hexdigest())
            with self.assertRaisesRegex(ValueError, 'archive path'):
                install(archive, release, base / 'public/data')
            self.assertFalse((base / 'public/escape.txt').exists())

    def test_pack_rejects_corrupt_referenced_files(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            manifest = self.fixture(base / 'source')
            (base / 'source' / manifest['version'] / 'index.json').write_text('corrupted')
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                pack(base / 'source', base / 'data.zip', base / 'release.json', 'marre/sl-isokron')


if __name__ == '__main__':
    unittest.main()
