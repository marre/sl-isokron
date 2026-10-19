"""Retain the current and two previous generated versions; never touch unknown directories."""
import argparse
import json
import shutil
from pathlib import Path

def prune(root,keep=3):
    root=Path(root).resolve()
    if keep<2:raise ValueError('Keep at least the current and last known good version')
    current=json.loads((root/'manifest.json').read_text())['version']
    current_path=root/current
    if Path(current).name!=current or current_path.is_symlink() or not current_path.is_dir():
        raise ValueError('Current manifest version is missing or invalid; refusing cleanup')
    managed=[]
    for p in root.iterdir():
        if p.is_symlink() or not p.is_dir() or p.resolve().parent!=root or not p.name.startswith(('sl-','demo-')):
            continue
        try:
            r=json.loads((p/'report.json').read_text())
            if r.get('version')==p.name and r.get('generator')=='sliso-data-v2':managed.append(p)
        except (OSError,ValueError):continue
    managed.sort(key=lambda p:p.stat().st_mtime,reverse=True)
    retain={current}
    for p in managed:
        if len(retain)<keep:retain.add(p.name)
    for p in managed:
        if p.name not in retain:shutil.rmtree(p)
    return sorted(retain)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',required=True);p.add_argument('--keep',type=int,default=3);a=p.parse_args();print('Retained versions:',prune(a.root,a.keep))
