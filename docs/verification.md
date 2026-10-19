# Verifiering och kvarstående arbete

Kravkälla: [version 0.6](kravspec.md). Status 2026-10-19: körbar utvecklingsversion med verkliga tidtabeller och partiell gångtäckning. Detta är inte ett pilotgodkännande.

## Utfört

- TypeScript-kontroll, Vite-produktionsbygge och filbudgetkontroll.
- 30 TypeScript-tester av restidsmodell, gångbudget, avgångsfönster, transferkontext, daterade turer, på-/avstigning, natt, sommartid, hållplatssökning och delningsformat. Motorn jämförs med ett oberoende uttömmande orakel i 60 små slumpade nät och med en oprunad sökning i ytterligare 100 nät med villkorade bytesregler.
- 22 Python-tester av kalenderundantag, GTFS-tider, fysisk gång, koordinatmatchning, bokningsregler, trafikurval, atomisk manifestersättning, versionsrensning och kvotspärr/återanvändning.
- 16 Chromium-integrationstester, 8 vardera för dator- och mobilvy: riktig worker och datahämtning, sökning/lägesval, resultat, förarsamordning, delning, tidszoner, avbrytning och dataluckor. De använder isolerade syntetiska fixturer; riktiga data skrivs inte över. Bakgrundstiles blockeras avsiktligt.
- Riktig GTFS Regional SL, feedversion 2026-10-19, hämtad genom Actions och kompilerad lokalt: 611 linjeposter, 14 219 hållplatslägen och cirka 5,76 miljoner daterade förbindelser. Alla aktörer ingår enligt beställarens uttryckliga beslut. Schema 2 partitionerar trafiken i UTC-timblock; största filen är cirka 9,6 MB, under gränsen 25 MiB.
- Riktigt OSM-gångnät filtrerat och routat lokalt med Valhalla. 1 041 lägen har konservativa geometriska anslutningar, och 10 460 riktade gångpar har beräknats. Underlaget är **inte manuellt granskat**, och stationernas plattforms-/entréförbindelser saknas. Se [datakällor och reproduktion](../data/README.md).
- [120 referenssökningar med verkliga data](benchmark-real-partial-walk.json): 20 startlägen × 30/60/120 minuter × 30/120 minuters avgångsfönster. Median 42 ms, p95 351 ms, högst 1 518 ms på denna container. Partiell gång begränsar söknätet och gör detta otillräckligt som bevis för prestanda med full gångtäckning. De valda lägena anges i råprotokollet; vissa avgångsfönster saknar trafik.
- [Manuellt browserflöde med verkliga paket](real-browser-smoke.json): T-Centralen, färdigt workerresultat med 55 nåbara lägen och tydlig utvecklingsmärkning i både datorvy och mobil emulering. Första lokal laddning cirka 1,24 s respektive 0,60 s; worker 85/66 ms. Tiles blockerades, och observerad JS-heap omfattar inte workern eller peakminne.

Benchmarkprocessens minne är inte webbläsarens peakminne. Beräknad gzipstorlek är inte uppmätt HTTP-överföring. Chromium med mobil skärm ersätter inte en fysisk iPhone eller Android. Äldre [benchmark.json](benchmark.json) gäller enbart det syntetiska nätet med 25 lägen.

## Acceptansmatris

| Fall | Läget |
| --- | --- |
| A01–A10 | Motorfall och browserflöden verifierade; verkliga resor behöver jämföras med oberoende referenser. |
| A11 | Kalender, tider över 24 och Stockholm/DST testade; verkliga nattresor ej manuellt granskade. |
| A12–A14 | Körningsisolering, avbrytning, länk, datum och saknat ID verifierade. |
| A15 | Kvotspärr och atomisk byggning testade; verklig Actions-hämtning lyckad. Webbdeployment och återhämtning i drift återstår. |
| A16 | Regional containerbenchmark och Chromiumprov finns. Fysisk mobil, full gångtäckning, nätöverföring och peakminne återstår. |
| A17–A18 | Avgångsfönster och klickvärden endast för hållplatslägen verifierade; inga restider för markytor. |
| A19 | 4 min gång och 7 min minsta bytestid kräver 7, verifierat. |
| A20 | Kända begränsade kanter utesluts; verkliga passager och tillträden ej platsgranskade. |
| A21 | Samma gångindex filtreras vid sökning; kedjad gång testad. Inget gång-API per fråga. |
| A22 | Felaktiga ID:n/flyttade koordinater stoppar importen före trafikurval. |
| A23 | Namngivet lägesval krävs. Ingen implicit gång mellan stationens plattformar. |
| A24–A25 | Idag + 7 inom täckning, UTC-nattpaket samt 0–4 byten verifierade. |

## Kvar före pilot

1. **Granska och komplettera fysisk gång.** 13 178 lägen saknar anslutning i det första indexet. Även automatiskt anslutna lägen kräver granskning; koordinater bevisar inte tillträde. Plattformar, trappor, entréer och passager måste kopplas med verifierat underlag. Mörby–Danderyds sjukhus är fortfarande ett uttryckligt granskningsfall. Appen visar osäker nåbarhet och utvecklingsmärkning.
2. **Genomför 30 verkliga referensresor.** `review-cases.csv` är märkt EJ_GRANSKAD. Fyll bara i jämförelsetider och gångvägar med verkligt, oberoende underlag. Samtliga linjer importeras, men det bevisar inte full användbar resvägstäckning när gång saknas.
3. **Prova fysiska enheter och full datamodell.** Safari/iOS, Android, nätladdning och workerpeakminne återstår, liksom tillgänglighetsrevision.
4. **Förbered drift separat.** Inga scheman eller deployments har aktiverats. Kontrollera kontots delade Trafiklab-/Actions-/Pageskvoter och tileleverantörens villkor före aktivering. GTFS CC0 och OSM ODbL-källor anges i datadokumentationen; gångderivatets källkod och proveniens medföljer.

Övriga explicita motorbegränsningar: olika trip_id räknas konservativt som olika fordon; telefonbokning och flexresor stöds inte. Typ 3, samordning med förare, ingår med information i resultatet. Frekvensturer, in-seat transfer_type 4/5 och okända trafikslag stoppar importen för vidare modellarbete. Allmän öppettidsrouting stöds inte.
