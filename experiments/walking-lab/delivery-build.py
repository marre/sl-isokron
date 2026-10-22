"""Build a PMTiles v3 transport fixture using the official Python writer."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path('.data-build/research-python').resolve()))
from pmtiles.writer import write
from pmtiles.tile import zxy_to_tileid,Compression,TileType
root=Path('.data-build/algorithm-lab/delivery');m=json.loads((root/'manifest.json').read_text())
with write(str(root/'walking.pmtiles')) as writer:
 for entry in sorted(m['entries'],key=lambda e:zxy_to_tileid(e['z'],e['x'],e['y'])):
  writer.write_tile(zxy_to_tileid(entry['z'],entry['x'],entry['y']),(root/'files'/entry['name']).read_bytes())
 writer.finalize({'tile_compression':Compression.GZIP,'tile_type':TileType.UNKNOWN},{'name':'sliso transport experiment','description':m['note']})
print('Archive bytes',(root/'walking.pmtiles').stat().st_size,'individual files',len(m['entries']))
