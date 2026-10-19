# Drift och kvoter

Tjänsten är en utvecklingsversion. Ingen webbdeployment eller automatisk schemaläggning har aktiverats av implementationen. Riktiga tidtabellspaket och ett partiellt gångindex har byggts; gångluckor märks i appen. Repot är publikt enligt GitHub, men dess synlighet har inte ändrats av agenten.

## GitHub Actions

`TRAFIKLAB_GTFS_KEY` finns enligt beställaren som Actions repository secret. Den har verifierats genom lyckad hämtning och inventering. Den behövs aldrig i webbläsaren eller en `VITE_`-variabel.

Öppna **Actions → Prepare SL data (opt-in) → Run workflow** på `main`:

| Input | Funktion |
| --- | --- |
| `inventory_only=true` | Hämta/cachea och inventera trafikdata, utan appbygge eller deployment. |
| `inventory_only=false` | Kompilera riktig tidtabell med `data/feed-scope.json` och det medföljande partiella `data/walking-index.json`, testa och bygg appen. |
| `initialize_quota_ledger=false` | Återanvänd sparad bokföring. Välj true endast första gången eller efter bekräftad cacheförlust och kontroll av kvarvarande Trafiklab-kvot. |
| `export_source=false` | Normalläge. True exporterar validerad rå GTFS som ett separat artefakt för lokal bearbetning; retention 1 dag. |
| `deploy=false` | Bygg för granskning utan att publicera. True kräver dessutom `SLISO_DEPLOY_ENABLED=true` och Cloudflare-inställningarna nedan. |

Artefakten `sliso-gtfs-inventory` innehåller rapport, hållplatser och linjer (7 dagars retention). Ett fullt bygge ger `sliso-validated-data` med `dist/` (3 dagar). Check-workflowens demo är separat och publiceras inte.

`SLISO_DATA_ENABLED=true` aktiverar dagliga hela databyggningar 03.17 UTC. Standard är av. Schemat ska inte aktiveras förrän ägaren har granskat kvoter och accepterat att det befintliga gångindexet ännu är partiellt. Vid flyttade/borttagna hållplatsbindningar stoppas bygget i stället för att återanvända gamla gångtider.

## Hämtning och återhämtning

Källadress: `https://opendata.samtrafiken.se/gtfs/sl/sl.zip`. GTFS Regional kräver `Accept-Encoding: gzip`; hämtaren annonserar och avkodar gzip innan ZIP-kontrollen. TLS, ZIP-CRC och efterföljande datapaketkontroller behålls. Råa felkroppar och begärans URL loggas inte eftersom de kan innehålla nyckeln.

Trafikdagar och turbundna regler kompileras till manifest schema 2 med UTC-timblock. `sourceUpdated` anger publicerad feedversion när datumet är känt; `updated` anger bygget. Appen markerar äldre källa och avvisar datum utan datatäckning. Vid ett misslyckat bygge förblir senast distribuerade version kvar; ingen automatisk betald reservtjänst används.

Kvotledger och source-ZIP återställs från CI-cache. Samma validerade ZIP återanvänds inom UTC-datumet. Även misslyckade anropsförsök räknas och ledger sparas med `always()`. Saknad ledger stoppar nätanrop; den återställs inte tyst. Nytt kalendermånadsskifte nollställer den lokala månadsräknaren. Andra klienter med samma API-nyckel måste räknas separat.

Efter en kodfix: **Run workflow** på senaste `main`, inte **Re-run jobs** på en äldre commit. Om API-nyckeln ändrats efter ett misslyckat försök gör nästa körning ett nytt försök; ingen ny secret behövs.

## Cloudflare Pages

Appen är statisk: `npm run build`, utdatamapp `dist`. Alla riktiga data ska först finnas under `public/data`. För manuell deployment via Actions behövs:

- repository variable `SLISO_DEPLOY_ENABLED=true`;
- repository variable `CLOUDFLARE_ACCOUNT_ID`;
- repository secret `CLOUDFLARE_API_TOKEN`;
- Pages-projekt `sliso` och en manuell körning med `deploy=true`.

Dessa värden har inte konfigurerats av agenten. Ingen Worker, R2, betalplan eller publik reposynlighetsändring krävs. En eventuell deployment visar fortfarande utvecklingsmärkning så länge gångindexet har `reviewed=false`. Att koden bygger är inte ett pilotgodkännande.

CI behåller aktuell och två tidigare identifierade genererade dataversioner. `prune_data.py` tar bara bort kataloger med matchande generatorstämpel och version under angiven datarot; okända kataloger och symlänkar lämnas orörda. Klienter som hållits öppna länge och behöver en borttagen version måste ladda om; nya och gamla paket blandas aldrig.

## Mätt budget och kvarvarande kontokrav

| Resurs | Observerat / stoppregel |
| --- | --- |
| Trafiklab Bronze | Dokumenterade 50 hämtningar/månad; lokal spärr 45 försök och högst en lyckad hämtning per UTC-dag. Normal daglig trafik 28–31 hämtningar. Delad kontokvot kan bara kontoinnehavaren verifiera. |
| Statisk data | Cirka 225 MB okomprimerade index för 10 UTC-dygn i det första bygget; 5,76 miljoner förbindelser. Största filen cirka 9,6 MB. Aktuell + 2 föregående versioner begränsar tillväxten. |
| Pages Free | Bygget stoppar vid 25 MiB per fil eller fler än 20 000 filer. Drygt 240 trafikblock per dataversion; ingen serverberäkning per fråga. Kontovillkor ska kontrolleras före deployment. |
| Första dataurval | Uppmätt offline-gzip omkring 4,2 MB i referensfrågorna, cirka 23,4 MB före komprimering. Det är beräknad kompression, inte observerad HTTP-överföring på en telefon. |
| Sökning | Lokal Web Worker. Minnesbudget 2 miljoner skapade tillstånd; ett överskridande ger ofärdigt resultat. Faktiska tider/configurationer finns i benchmarkprotokollet; mobil peakminne återstår. |
| Gångförberedelse | OSM-utdrag 916 MB; filtrerat nät cirka 2,62 miljoner noder/2,74 miljoner segment. Lokal filtrering 151 s, ombyggnad av Valhalla-tiles cirka 42 s, parberäkning cirka 6 s på denna container. Detta körs separat, inte för varje daglig trafikuppdatering. |
| CI/cache/artefakt | Publik standardrunner används. Kontoinnehavaren behöver kontrollera gemensam lagringskvot och stoppa fakturerad överförbrukning. Cacheförlust stoppar automatiska hämtningar om ledger saknas. Inga betalda reservvägar finns i koden. |
| Karttiles | Utbytbara OSM standardtiles som pilotinställning. Ingen tile-prefetch eller offline-tilecache. HTTP-cache sköts av webbläsaren. Vid fel fungerar hållplatskartan utan bakgrund. Aktuell policy/kapacitet ska kontrolleras före pilot. |

## Lokalt dataarbete

Med en redan hämtad fil behövs ingen API-nyckel:

```sh
python scripts/inventory_gtfs.py --gtfs .data-build/source/sl.zip
python scripts/build_data.py --gtfs .data-build/source/sl.zip \
  --walks data/walking-index.json --scope data/feed-scope.json
npm run build
```

Gångkällor, licenser, checksummor, optional dependencies och ombyggnadsmetod finns i [data/README.md](../data/README.md). Nycklar får inte läggas i källfiler, URL-fragment, artefakter eller loggar. Delningslänkar innehåller användarens startval och inställningar, men ingen central sökhistorik lagras.
