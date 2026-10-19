# sliso

Svensk restidskarta för SL-hållplatslägen. Statisk TypeScript-app med Leaflet och sökning i en Web Worker. Ingen backend, inloggning, adressökning eller betald reservtjänst.

**Status: körbar utvecklingsversion med riktig GTFS-import och ett partiellt OSM-gångindex.** Trafikurvalet omfattar enligt beställarens val samtliga linjer i SL-feeden, även UL, Waxholmsbolaget och närtrafiken. Gångindexet kopplar 1 041 av 14 219 hållplatslägen; stationers entréer/plattformar och de 30 verkliga referensresorna behöver fortsatt granskning. Appen märker därför realdata som utvecklingsläge och visar osäker nåbarhet där gångunderlaget saknas. Webbversionen är publicerad av beställaren via Cloudflare; den är fortfarande en utvecklingsversion.

## Kör lokalt

Node 24 (se `.node-version`) och Python 3.12+ med systemets tidszonsdatabas behövs. Tidtabellsbygget använder Pythons standardbibliotek. Den separata OSM-förberedelsen har extra beroenden enligt `scripts/requirements-walking.txt`.

```sh
npm ci
npm run data:pull
npm run dev
```

Ovanstående hämtar den versionslåsta riktiga datareleasen från GitHub, verifierar SHA-256 och startar appen. Ingen API-nyckel behövs. För en uttrycklig **syntetisk demo** kan du i stället köra `npm run data:demo`; gör inte det ovanpå ett riktigt dataset. För att kompilera egen GTFS:

```sh
python scripts/build_data.py --gtfs .data-build/source/sl.zip \
  --walks data/walking-index.json --scope data/feed-scope.json
npm run dev
```

Nyckeln `TRAFIKLAB_GTFS_KEY` finns som Actions-hemlighet och behövs inte i webbläsaren. Det manuella dataflödet kan bygga riktiga paket och lämna ett dist-artefakt utan deployment; se driftinstruktionerna.

I Codex-miljön, om standardcachen är skrivskyddad: `npm ci --cache /workspace/.npm-cache`.

```sh
npm test
npm run test:python
npm run build
npm run test:e2e
```

Webbläsartester skapar egna demofixturer i `.data-build/browser-public` och använder port 5174; de skriver inte över riktiga appdata. De använder `/usr/bin/chromium`. Ange `CHROMIUM_PATH` till en annan Chromium-installation. `npx playwright install chromium` installerar Playwrights version; sätt sedan `CHROMIUM_PATH` till dess körbara fil. Testerna kör mobil- och datorvyer; det ersätter inte tester på fysisk iPhone/Android.

`npm run preview` serverar produktionsbygget. Demo genereras uttryckligen och förnyas inte tyst av appen. Bygg/importera om data om dess giltighet gått ut. En riktig importerad feed ska inte skrivas över med demo.

## Funktioner

- Lokal hållplatssökning med svenskt stöd, separat val av namngivet hållplatsläge och startval på kartan.
- Datum idag till idag + 7 i **Europe/Stockholm**, inom datatäckningen. Ogiltiga och tvetydiga tider vid sommartidsbyten avvisas uttryckligen.
- Max restid 10–120 min, gång 5–30 min per sammanhängande sträcka, 0–4 byten, fem trafikslagsfilter, avgångsfönster 5–120 min (standard 30).
- Beräkning i Web Worker, avbrytning genom att terminera processen, separata laddnings-/beräkningsstatusar och isolerade körnings-ID:n.
- Diskreta 10-minutersband, klickvärden, färdig/okänd/ej nåbar, tangentbordsåtkomliga hållplatsmarkörer och delningslänk i URL-fragmentet.
- Versionsbundna SHA-256-kontrollerade data, binära timblock och frivillig Cache API-lagring med minnesfallback.
- GTFS-import, offlineförberäkning av gångpar från ett konservativt OSM-nät eller en granskad gånggraf och opt-in CI för dagliga databyggningar.

## Restidsmodell

`R = gång före första påstigning + sista ankomst − första påstigning + avslutande gång`.

Initial väntan exkluderas; väntan vid byten ingår. Olika mål kan använda olika första avgångar inom fönstret. Sökmotorn sparar alternativa tillstånd för faktisk ankomst, restid, gångbudget och transferkontext. Den beräknar **inte** bara tidigaste ankomst. Samma tur kan följas förbi hållplatser där på-/avstigning inte tillåts. Olika GTFS-turer räknas konservativt som olika fordon; `block_id` är inte bevis för obruten fordonskontinuitet.

En gångsträcka summeras över flera kanter och återställs först vid påstigning. Minsta bytestid räknas från senaste avstigning, parallellt med fysisk gång; 4 min gång och 7 min minsta bytestid kräver 7 minuter, inte 11. Gång till en avslutande SL-hållplats ingår. Saknad gångväg fylls aldrig med fågelvägstider.

## Riktiga data och drift

Se [dataflöde och filformat](docs/data.md), [drift och kvoter](docs/operations.md), [verifiering och öppna datagap](docs/verification.md) och [ursprunglig kravspecifikation](docs/kravspec.md).

Cloudflare Workers Git-integration: bygg `npm run build`, deploy `npx wrangler deploy`. `prebuild` hämtar den verifierade datareleasen när `public/data/manifest.json` saknas. Bara `data/release.json` ligger i Git; det stora arkivet ligger i GitHub Releases. Se [driftinstruktionerna](docs/operations.md). Cloudflare Pages kan också publicera samma `dist`. Kontrollworkflow bygger demo enbart för tester; det publicerar inget. Automatiska datakörningar är avstängda tills driftansvarig konfigurerar data, kvotledger och CI-variabler. Ett manuellt inventeringsläge kan köras med Trafiklab-hemligheten och kvotinitiering; se driftinstruktionerna. Repots synlighet har inte ändrats.

Bakgrundskartan använder OSM standardtiles som utbytbar pilotinställning. Granska aktuell användningspolicy innan pilot. `.env.example` visar konfigurationen; `VITE_TILE_URL=none` stänger av externa tiles utan att påverka sökningen. Typsnitt levereras med appen. Inga hemligheter får ligga i `VITE_`-variabler, delningslänkar eller apppaketet.

Mätning på verklig feed med det partiella gångindexet finns i [benchmark-real-partial-walk.json](docs/benchmark-real-partial-walk.json). Det är containerdata, inte fysisk mobilprestanda. [Datakällor och byggmetod](data/README.md) beskriver gångluckor, licenser och reproduktion. Bakgrundstiles är avsiktligt blockerade i automatiska webbläsartester.
