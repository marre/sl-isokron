# Verifiering och kvarstående arbete

Kravkälla: [version 0.6](kravspec.md). Detta är implementationens status, inte ett godkännande av verklig trafiktäckning.

## Utfört i molnmiljön

- TypeScript-kontroll och Vite-produktionsbygge.
- 24 TypeScript-tester: restidsmodell, gångbudget per sträcka, avgångsfönster, transferregler, på-/avstigning, natt, sommartid, delningsformat, tidszoner och datumgränser.
- En oberoende uttömmande eventgrafsökning jämförs med sökmotorn i 60 deterministiskt slumpade små nät. Oraklet använder ingen produktionsdominans och går ett fordonssegment i taget.
- 14 Python-tester: kalenderundantag, GTFS-tidsförankring, fysisk gång, stängda passager, koordinatmatchning, checksummor, atomisk manifestersättning och kvotspärr/återanvändning utan autentiserad nättrafik.
- 14 Chromium-integrationstester (7 per mobil-/datorvy): verklig Web Worker och datahämtning, hållplatssökning med tangentbord, lägesval, resultat/filter, delning, annan tidszon, avbrytning, försvunnet ID och datum utan täckning. Bakgrundstiles blockeras avsiktligt i testerna så att de inte belastar extern karttjänst.
- `npm ci` prövad med låsfilen och skrivbar cache. `npm audit --omit=dev` rapporterar inga kända runtime-sårbarheter vid körningen.
- 120 syntetiska referenssökningar: 20 startplatser × 30/60/120 minuter × 30/120 minuters avgångsfönster. Maskin, dataset, råa tider, minnesobservation och storlekar finns i [benchmark.json](benchmark.json). Kör om med `node --import tsx scripts/benchmark.ts`.

Mätningen gäller ett litet nät med 25 hållplatslägen. Container-CPU är inte en vanlig bärbar dator eller mobil. Nodprocessens minnesvärden gäller hela benchmarkprocessen, inte webbläsarens peakminne. Offline-gzipvärdet är inte en observerad HTTP-överföring. Regional SL-prestanda eller gratisdrift har inte verifierats.

## Acceptansmatris

| Fall | Läget |
| --- | --- |
| A01–A10 | Syntetiska motorfall verifierade; UI-klick och legend provade i webbläsare. Inga verkliga SL-anspråk. |
| A11 | Motor-/importtest av kalender, tider över 24 och Stockholm/DST; verkliga SL-natturer ej granskade. |
| A12–A14 | Körningsisolering, avbrytning, länk, datum och saknat ID verifierade i webbläsare och/eller enhetstest. |
| A15 | Lokal kvotspärr och misslyckad atomisk byggning testade. Verkliga leverantörskvoter och Actions-/Pagesdrift ej provade. |
| A16 | Syntetisk containerbenchmark och responsiva browser-vyer. Fysisk mobil, första HTTP-laddning och peakminne återstår. |
| A17 | Avgångsfönster/serialisering verifierade. UI utlöser ny sökning när giltigt fönster ändras. |
| A18 | Klickvärden finns bara för hållplatslägen; inga markytor eller fritextadressers restider. Browserfall verifierar markerpopup. |
| A19 | Gång 4 och minsta bytestid 7 kräver 7, verifierat med oberoende förväntat värde. |
| A20 | Kända begränsade grafkanter utesluts i gångbyggaren och i gångimporten. Verkliga passager ej inventerade. |
| A21 | Samma gångindex filtreras vid sökning; kedjad gång och gränser testade. Inget gång-API per sökning. |
| A22 | Felaktiga hållplats-ID:n/flyttade koordinater stoppar importen i test. |
| A23 | Flera plattformar kräver namngivet val; browserfall och inga implicita gångkanter. |
| A24 | Idag + 7 accepteras inom täckning, + 8 avvisas; nattpaket laddas efter faktisk UTC-avgång. |
| A25 | Endast 0–4 byten accepteras i formulär, motor och länk. |

## Produktionsblockerare / datagap

1. **SL-feed saknas.** Trafiklab-konto finns enligt beställaren, men nyckeln är enligt beställaren inlagd som Actions-hemligheten TRAFIKLAB_GTFS_KEY i GitHub-repot. Den finns inte i molnprocessen. Ingen feedhämtning med konto har ännu kunnat verifieras här; GitHubs API blockeras av miljöns nätpolicy. Ett separat manuellt inventeringsläge finns nu utan krav på gånggraf. Ingen faktisk linje-, lokalbane-, båt- eller gränsöverskridande täckning har bekräftats.
2. **Verifierat gångunderlag saknas.** Offlinebyggaren behöver en granskad gånggraf och uttryckliga plattformsbindningar eller ett verifierat gångpar-index. Den bygger inte ett regionalt OSM-PBF-utdrag eller tolkar stationernas verkliga entréer själv.
3. **Täckningsgranskning saknas.** De 30 referensfallen i `review-cases.csv` är föreslagna och märkta EJ_GRANSKAD. Ingen tid eller gångväg får fyllas i som verifierad utan verkligt underlag. Mörby station–Danderyds sjukhus är särskilt utpekat.
4. **Verklig storlek och prestanda saknas.** Paket över 25 MiB stoppar bygget; ytterligare partitionering krävs om en regional fil blir större. Minnes-/tidsbudget på faktisk regional data måste mätas innan frontendarkitekturen godkänns.
5. **Safari/iOS, Android och produktionsdrift är oprövade.** Chromium mobil emulerar skärm/touch, inte iOS-motor/minnesbeteende. Tangentbordsflöde prövat, men ingen full tillgänglighetsrevision.
6. **Externa villkor är delvis granskade.** Trafiklab-webbplatsen, OSM-policy och karttiles gav proxyblockering (HTTP CONNECT 403). Trafiklabs officiella GTFS Regional-dokumentation och OpenAPI kunde däremot läsas via deras GitHub-repon; nedladdningsadressen och kravet på gzip-stöd är kontrollerade där. Ingen TLS-kontroll har avaktiverats. Leverantörsvillkor, ODbL/distributionsrätt och gratis kontokvoter måste verifieras före aktivering.

Övriga explicita motorbegränsningar: konservativ fordonskontinuitet mellan olika trip_id, inga bokningsresor, inga frekvensbaserade turer utan expansion, inga in-seat transfer_type 4/5, ingen generell öppettidsrouting. Osupporterade GTFS-fall stoppar importen; stöd får inte påstås genom att tyst utelämna data.
