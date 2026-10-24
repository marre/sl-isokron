This isolates stop rendering from basemap tiles, walking contours and routing.
It loads the real local `public/data` stop set and deployment service index.
Measurements use mobile/desktop viewport emulation and software WebGL, not a
physical phone. Pan wall time includes a 500 ms animation. Do not interpret it
as physical-device FPS or add overlapping browser/worker times together.

Start `npm run dev -- --port 5199`, then:

```sh
node experiments/stop-rendering/run.mjs .data-build/stops-after.json
```

For the pre-optimization baseline from the MapLibre migration:

```sh
git show 72a4b22:src/map-stops.ts > .data-build/map-stops-before.ts
python - <<'PY'
from pathlib import Path
p = Path('.data-build/map-stops-before.ts')
p.write_text(p.read_text().replace("'./map'", "'../src/map'").replace("'./core/types'", "'../src/core/types'"))
PY
node experiments/stop-rendering/run.mjs .data-build/stops-before.json --baseline
```

The hover phase changes and restores the emphasis on twelve stops. It is a
controlled renderer workload, not a sequence of real route searches. The results
phase applies synthetic visibility/colour values to the same real stop positions.
Inspect `sourceUpdates`, attached keyboard-node count, and browser scripting,
layout and style time alongside wall time. Initial clustering and count-sprite
creation add setup work; rerunning on an otherwise idle machine is recommended.
