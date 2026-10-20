import contextlib
import io
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from walking_areas import build


class WalkingAreaBudgetTests(unittest.TestCase):
    def test_endpoint_access_is_paid_before_network_expansion(self):
        requests=[]
        class Actor:
            def __init__(self,config): pass
            def isochrone(self,request):
                requests.append(request)
                return {'features':[{'properties':{'contour':c['time']},'geometry':{'type':'Polygon','coordinates':[]}} for c in request['contours']]}
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'config').write_text(json.dumps({'service_limits':{'isochrone':{}}}))
            (root/'anchors').write_text(json.dumps([{'id':'a','lat':59,'lon':18,'anchorLat':59,'anchorLon':18,'offsetMetres':4}]))
            (root/'walks').write_text(json.dumps({'version':'fixture'}))
            with patch.dict(sys.modules,{'valhalla':types.SimpleNamespace(Actor=Actor)}),contextlib.redirect_stdout(io.StringIO()):
                build(root/'config',root/'anchors',root/'walks',root/'areas')
            contours=requests[0]['contours']
            self.assertAlmostEqual(contours[0]['time']*60+4/(80/60),60)
            self.assertAlmostEqual(contours[-1]['time']*60+4/(80/60),1800)
            output=json.loads((root/'areas/areas-0000.json').read_text())['a']
            self.assertEqual([c['minutes'] for c in output],list(range(1,31)))
