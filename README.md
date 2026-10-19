# sliso

Svensk restidskarta för SL-hållplatslägen. Statisk TypeScript-app med Leaflet och sökning i en Web Worker. Ingen backend, inloggning, adressökning eller betald reservtjänst.

**Status: fungerande implementation med syntetisk testdata. Inte en verifierad SL-reseplanerare.** Aktuell SL-feed, verifierat gångunderlag, licensgranskning, 30 granskade verkliga SL-resor och mätningar på fysiska telefoner återstår. Testdata är tydligt märkt i appen och får inte användas för verklig reseplanering.

## Kör lokalt

Node 24 (se `.node-version`) och Python 3.12+ med systemets tidszonsdatabas behövs. Python använder bara standardbiblioteket.

```sh
npm ci
npm run data:demo
npm run dev
```

I Codex-miljön, om standardcachen är skrivskyddad: `npm ci --cache /workspace/.npm-cache`.

```sh
npm test
npm run test:python
npm run build
npm run test:e2e
```

Webbläsartester använder `/usr/bin/chromium`. Ange `CHROMIUM_PATH` till en annan Chromium-installation. `npx playwright install chromium` installerar Playwrights version; sätt sedan `CHROMIUM_PATH` till dess körbara fil. Testerna kör mobil- och datorvyer; det ersätter inte tester på fysisk iPhone/Android.

`npm run preview` serverar produktionsbygget. Demo genereras uttryckligen och förnyas inte tyst av appen. Bygg/importera om data om dess giltighet gått ut. En riktig importerad feed ska inte skrivas över med demo.

## Funktioner

- Lokal hållplatssökning med svenskt stöd, separat val av namngivet hållplatsläge och startval på kartan.
- Datum idag till idag + 7 i **Europe/Stockholm**, inom datatäckningen. Ogiltiga och tvetydiga tider vid sommartidsbyten avvisas uttryckligen.
- Max restid 10–120 min, gång 5–30 min per sammanhängande sträcka, 0–4 byten, fem trafikslagsfilter, avgångsfönster 5–120 min (standard 30).
- Beräkning i Web Worker, avbrytning genom att terminera processen, separata laddnings-/beräkningsstatusar och isolerade körnings-ID:n.
- Diskreta 10-minutersband, klickvärden, färdig/okänd/ej nåbar, tangentbordsåtkomliga hållplatsmarkörer och delningslänk i URL-fragmentet.
- Versionsbundna SHA-256-kontrollerade data, binära dygnspaket och frivillig Cache API-lagring med minnesfallback.
- GTFS-import, offlineförberäkning av gångpar från granskad gånggraf och opt-in CI för dagliga databyggningar.

## Restidsmodell

`R = gång före första påstigning + sista ankomst − första påstigning + avslutande gång`.

Initial väntan exkluderas; väntan vid byten ingår. Olika mål kan använda olika första avgångar inom fönstret. Sökmotorn sparar alternativa tillstånd för faktisk ankomst, restid, gångbudget och transferkontext. Den beräknar **inte** bara tidigaste ankomst. Samma tur kan följas förbi hållplatser där på-/avstigning inte tillåts. Olika GTFS-turer räknas konservativt som olika fordon; `block_id` är inte bevis för obruten fordonskontinuitet.

En gångsträcka summeras över flera kanter och återställs först vid påstigning. Minsta bytestid räknas från senaste avstigning, parallellt med fysisk gång; 4 min gång och 7 min minsta bytestid kräver 7 minuter, inte 11. Gång till en avslutande SL-hållplats ingår. Saknad gångväg fylls aldrig med fågelvägstider.

## Riktiga data och drift

Se [dataflöde och filformat](docs/data.md), [drift och kvoter](docs/operations.md), [verifiering och öppna datagap](docs/verification.md) och [ursprunglig kravspecifikation](docs/kravspec.md).

Cloudflare Pages: bygg `npm run build`, utdatamapp `dist`. Riktiga datapaket måste först vara byggda i `public/data`. Kontrollworkflow bygger demo enbart för tester; det publicerar inget. Datapipelinen är avstängd tills driftansvarig uttryckligen konfigurerar data, kvotledger och CI-variabler. Ingen ändring av repots synlighet eller publicering har gjorts.

Bakgrundskartan använder OSM standardtiles som utbytbar pilotinställning. Granska aktuell användningspolicy innan pilot. `.env.example` visar konfigurationen; `VITE_TILE_URL=none` stänger av externa tiles utan att påverka sökningen. Typsnitt levereras med appen. Inga hemligheter får ligga i `VITE_`-variabler, delningslänkar eller apppaketet.
