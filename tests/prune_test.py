import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from prune_data import prune

class PruneTests(unittest.TestCase):
    def test_current_and_recent_versions_survive_and_unknown_or_external_files_are_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp);root=base/'data';root.mkdir();outside=base/'outside';outside.mkdir();(outside/'user.txt').write_text('keep')
            for i in range(5):
                p=root/f'sl-{i}';p.mkdir();(p/'report.json').write_text(json.dumps({'version':p.name,'generator':'sliso-data-v2'}));os.utime(p,(100+i,100+i))
            (root/'manifest.json').write_text(json.dumps({'version':'sl-0'}))
            (root/'sl-user-files').mkdir();(root/'sl-user-files'/'note.txt').write_text('keep')
            (root/'sl-external').symlink_to(outside,target_is_directory=True)
            self.assertEqual(prune(root,3),['sl-0','sl-3','sl-4'])
            self.assertFalse((root/'sl-1').exists());self.assertFalse((root/'sl-2').exists())
            self.assertTrue((root/'sl-user-files'/'note.txt').exists());self.assertTrue((outside/'user.txt').exists());self.assertTrue((root/'sl-external').is_symlink())

if __name__=='__main__':unittest.main()
