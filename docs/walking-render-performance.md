# Client-side walking-band rendering

The browser still loads the verified, precomputed walking contours and calculates
transport journeys locally. No runtime routing or image-rendering server was added.

Progressive file arrivals previously cloned every loaded contour into the rendering
worker and rebuilt its complete travel-time field. The worker now keeps standard-band
contours for the current viewport, receives new geometry once, and adds only new or
improved contributions. Each pixel retains the smallest arrival-time band. Moving to
a different viewport or changing the selected source files resets the accumulated
field, so removed sources cannot leave stale areas behind.

Partial slider cutoffs continue to use their actual native contours. Only three
partial raster masks are cached; their extra geometry is discarded after rendering.
Standard-band geometry is released when the viewport generation changes. Search reset
and cancellation terminate the worker. Painting writes RGBA channels directly instead
of invoking a typed-array copy for every painted pixel.

## Reproduce the compositor measurement

```sh
npx tsx scripts/benchmark_bands.ts /path/to/local/data 120
```

This reads existing local shards and downloads nothing. It selects the nearest
available native walking-profile files to central Stockholm, uses their 10-, 20-,
and 30-minute contours, and simulates progressive arrivals in batches of six. It
compares the previous complete-rebuild algorithm with incremental composition and
asserts that their final pixel fields are identical, including holes and overlaps.
This is a compositor benchmark, not a transport-query or network benchmark.

One container run on 2026-10-22, dataset `sl-68186fa6a6b514ac3e25`, 120 files,
519 contours, a 600 × 900 raster:

| Measurement | Complete rebuilds | Incremental |
| --- | ---: | ---: |
| Cloning and rasterization | 2,217 ms | 301 ms |
| Geometry copies across all updates | 5,586 | 519 |

That run was 7.37× faster for this phase with identical final pixels. These are
container measurements, not physical-phone performance or a guarantee of total
search speed. Downloading and decoding the static profiles still take time.

A separate sequential Chromium mobile-viewport smoke comparison (390 × 844), using
Arlanda terminal 4 on 2026-10-22 at 08:07, 120 travel minutes, 30 walking minutes and
four transfers, moved to central Stockholm at zoom 13. Walking-layer completion
fell from 17,772 ms to 10,688 ms (about 40%). The timer starts after transport
routing; it includes progressive profile loading from a local mirror, rendering,
and a forced garbage collection for the heap check. Basemap tiles were blocked.
A 91-minute display cutoff took 213 ms before and 197 ms after, with no additional
data requests. These are single-run observations, not statistical device benchmarks.

Browser verification also covers progressive overlays, viewport changes, cancellation,
slider cache eviction, and mobile interaction. A real-data smoke test checks native
walking coverage at SkyCity, its estimated terminal-access journey, no new downloads
when moving the display cutoff, and no browser errors.
