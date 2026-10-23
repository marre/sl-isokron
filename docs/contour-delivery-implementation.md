# Spatial contour delivery and selective overviews

The production renderer now uses the delivery architecture recommended in
[the bundle/layer experiments](delivery-layers.md). Journey calculation and precise
stop times remain client-side and unchanged.

## Delivery

New data builds spatially bundle native contour archives into approximately
1 km cells, targeting 256 KiB compressed. Every native minute and geometry chunk
is preserved verbatim. A logical source archive always remains inside one physical
bundle. The `walkingAreas.sources` mapping preserves the original contribution
selection independently of download-file membership. This is necessary to avoid
changing colours/coverage when adjacent archives are packed together.

The release migrated from `sl-e444dbdac6b699b9d8bf` is
`sl-cf26ae3305b49dbcebac`:

| Layer | Files | Compressed bytes |
| --- | ---: | ---: |
| Previous native archives | 7,153 | 215,187,587 |
| Bundled native detail | 2,351 | 213,965,664 |
| Separate overview | 511 | 52,207,840 |

Request admission no longer waits for animation frames. Download concurrency stays
bounded at six; progressive raster painting remains independently scheduled.
Decoded files outside the current viewport are discarded, while verified files
remain available in CacheStorage. Cache pruning now includes overview references.

## Layer policy

An overview is used only at **zoom 12 or below**, when the selected native detail
would require **at least 48 bundles and 2 MiB**. Small or close views load native
detail directly. A qualifying overview loads **only overview files**, not a full
preview followed automatically by full detail. Zooming in, or panning into a view
that no longer qualifies, replaces it with the detailed layer.

The overview retains the first available contour plus native five-minute knots,
packed into approximately 4 km cells. Requested allowances round down to the
largest available knot. This affects only the area graphics: stops, routing,
reachability and journey details keep their precise calculated values. As the
research report explains, native contours are not perfectly nested, so rounding
down does not guarantee a strict geometric subset.

The overview has a small visible **“Översikt · zooma in för detaljer”** map label,
including when the mobile legend is collapsed, plus explanatory status text and
an accessible canvas label. Switching layers terminates the old worker and removes
its raster; old approximate colours cannot survive inside the new detail field.
Raster replies also carry a generation ID to reject results from obsolete
contributor selections. Reset, toggling, panning and zooming cancel obsolete work.

## Verification and measurements

- All 7,153 input archives were SHA-256 verified before the migration; each output
  bundle was decoded and checked against its input geometry/minute chunks.
- The TypeScript and Python suites pass, including bundle splitting, spatial
  boundaries, sparse knots, deterministic output, old-release retention and
  verification of overview checksums and source mappings.
- The complete browser suite passed **49 tests**, with one intentional desktop
  skip for the mobile-only layout test. Both viewport projects exercise
  progressive loading, same-bundle logical selection changes, overview/detail
  switching, reset and late download cancellation.
- The production build fits Cloudflare's budget: **11,106 / 20,000 files** with the
  new and previous immutable releases, and every asset below 25 MiB.
- The production acceptance harness compares detailed RGBA hashes with the
  recorded original-layout reference for cold loading, warm loading, a 91-minute
  cutoff and panning. After overview-to-detail switching it compares against a
  fresh detail render at the same map bounds, avoiding invalid comparisons between
  rasters anchored to different padded bounds.

[Production acceptance measurements](contour-delivery-implementation-results.json)
record local Chromium runs at a 390 × 844 viewport, with zero and 40 ms fixed local
HTTP response delay. These are overlay-only timings after routing, not phone/CDN
benchmarks. The benchmark's local version `sl-44f458a396b05d888b63` differs
from the published ID because metadata key order differed between Python processes;
all 2,862 contour checksums, indices and logical-source mappings were compared and
are identical. Future builds preserve archive order rather than iterating sets;
a cross-process hash-seed test checks this. Timing variation across separate runs should not be interpreted as a
paired speed comparison. The city detail request count is **142 versus the previous
810** with the same 21,911,874 bundled bytes; warm loads and cutoff changes make no
network requests. Overviews are tested at zoom 11 and load no detail files.

## Build and release

`scripts/contour_bundles.py` is used by normal `build_data.py` publication, so later
GTFS builds retain this layout. Legacy JSON/demo datasets and existing unbundled
releases remain supported by the browser.

To migrate an existing compiled native release without GTFS/OSM requests:

```sh
python scripts/release_data.py fetch --output .data-build/migration/data
python scripts/bundle_contours.py --root .data-build/migration/data
python scripts/prune_data.py --root .data-build/migration/data --keep 2
python scripts/release_data.py pack --root .data-build/migration/data \
  --output .data-build/migration/sliso-data.zip \
  --descriptor .data-build/migration/release.json --repository marre/sl-isokron
```

The **Bundle contour delivery** workflow performs the migration, retains the
immediately previous immutable version and publishes the archive/descriptor as a
GitHub Release. The small checksum-pinned `data/release.json` pointer selects what
Cloudflare installs. Large archives remain outside Git.

The production browser acceptance harness is in
`experiments/delivery-lab/production.{ts,mjs}`. It uses the recorded fixture from
the research report, the installed `public/data/manifest.json`, and a local server
on port 5198 serving `.data-build/production-bundles/data`. Build its static site
with `npx vite build --config experiments/delivery-lab/production.config.ts`.
