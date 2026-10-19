"""Stop before Pages deployment when static file limits are exceeded."""
from pathlib import Path

files = [p for p in Path('dist').rglob('*') if p.is_file()]
if not files:
    raise SystemExit('Build output missing')
if len(files) > 20000:
    raise SystemExit('Pages Free file count exceeded; prune retained data before deploying')
too_large = [str(p) for p in files if p.stat().st_size >= 25 * 1024 * 1024]
if too_large:
    raise SystemExit('Pages 25 MiB limit exceeded: ' + ', '.join(too_large))
print(f'Pages file budget: {len(files)}/20000 files; every file below 25 MiB')
