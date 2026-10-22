# Drift och kvoter

Tjänsten är en utvecklingsversion. Beställaren har publicerat appen via Cloudflares Git-integration till `sliso.markus-eriksson.workers.dev`. Automatisk daglig datahämtning är fortfarande avstängd. Riktiga tidtabellspaket och ett partiellt gångindex har byggts; gångluckor märks i appen. Repot är publikt enligt GitHub, men dess synlighet har inte ändrats av agenten.

## GitHub Actions

`TRAFIKLAB_GTFS_KEY` finns enligt beställaren som Actions repository secret. Den har verifierats genom lyckad hämtning och inventering. Den behövs aldrig i webbläsaren eller en `VITE_`-variabel.

Öppna **Actions → Prepare SL data (opt-in) → Run workflow** på `main`:

| Input | Funktion |
| --- | --- |
| `inventory_only=true` | Hämta/cachea och inventera trafikdata, utan appbygge eller deployment. |
| `inventory_only=false` | Kompilera riktig tidtabell med `data/feed-scope.json` och det medföljande partiella `data/walking-index.json`, testa och bygg appen. |
| `initialize_quota_ledger=false` | Återanvänd sparad bokföring. Välj true endast första gången eller efter bekräftad cacheförlust och kontroll av kvarvarande Trafiklab-kvot. |
| `export_source=false` | Normalläge. True exporterar validerad rå GTFS som ett separat artefakt för lokal bearbetning; retention 1 dag. |
| `prepare_walking=false` | True bygger om gångavstånd och ungefärliga gångområden från den checksummebundna OSM-källan. Kör vid första aktivering, cacheförlust eller förnyat gångunderlag. Den checksummeverifierade PBF-källan sparas i Actions-cache tillsammans med förberedda index och konturer. Tiles används temporärt. |
| `publish_release=false` | True publicerar kompilerade data som en versionsmärkt GitHub Release och uppdaterar den lilla `data/release.json` i Git. Det triggar Cloudflares befintliga Git-integration. Kräver `inventory_only=false`. |
| `deploy=false` | Bygg för granskning utan att publicera. True kräver dessutom `SLISO_DEPLOY_ENABLED=true` och Cloudflare-inställningarna nedan. |

Artefakten `sliso-gtfs-inventory` innehåller rapport, hållplatser och linjer (7 dagars retention). Ett fullt bygge ger `sliso-validated-data` med `dist/` (3 dagar). Check-workflowens demo är separat och publiceras inte.

`SLISO_DATA_ENABLED=true` aktiverar dagliga hela databyggningar 03.17 UTC. Standard är av. Schemat ska inte aktiveras förrän ägaren har granskat kvoter och accepterat att det befintliga gångindexet ännu är partiellt. Vid flyttade/borttagna hållplatsbindningar stoppas bygget i stället för att återanvända gamla gångtider.

## Hämtning och återhämtning

Källadress: `https://opendata.samtrafiken.se/gtfs/sl/sl.zip`. GTFS Regional kräver `Accept-Encoding: gzip`; hämtaren annonserar och avkodar gzip innan ZIP-kontrollen. TLS, ZIP-CRC och efterföljande datapaketkontroller behålls. Råa felkroppar och begärans URL loggas inte eftersom de kan innehålla nyckeln.

Trafikdagar och turbundna regler kompileras till manifest schema 2 med UTC-timblock. `sourceUpdated` anger publicerad feedversion när datumet är känt; `updated` anger bygget. Appen markerar äldre källa och avvisar datum utan datatäckning. Vid ett misslyckat bygge förblir senast distribuerade version kvar; ingen automatisk betald reservtjänst används.

Kvotledger och source-ZIP återställs från CI-cache. Samma validerade ZIP återanvänds inom UTC-datumet. Även misslyckade anropsförsök räknas och ledger sparas med `always()`. Saknad ledger stoppar nätanrop; den återställs inte tyst. Nytt kalendermånadsskifte nollställer den lokala månadsräknaren. Andra klienter med samma API-nyckel måste räknas separat.

Efter en kodfix: **Run workflow** på senaste `main`, inte **Re-run jobs** på en äldre commit. Om API-nyckeln ändrats efter ett misslyckat försök gör nästa körning ett nytt försök; ingen ny secret behövs.

## Cloudflare Workers med befintlig Git-integration

Cloudflare kan bara bygga de filer som finns i en ny utcheckning. `public/data` är avsiktligt ignorerad i Git. Actions-artefakter följer inte med en Git-utcheckning och är heller ingen permanent anonym nedladdningsadress.

Datakedjan är därför:

1. **Prepare SL data** med `inventory_only=false`, `publish_release=true`, `initialize_quota_ledger=false` och `deploy=false` hämtar eller återanvänder GTFS, bygger och testar riktiga data.
2. Ett separat jobb med `contents: write` packar data till `sliso-data.zip` och publicerar en versionsmärkt GitHub Release. Arkivet ligger utanför Git; källa, gånglicenser och begränsningar följer med manifestet och repo-dokumentationen.
3. Jobbet uppdaterar endast den lilla `data/release.json` i `main`, med en fast versionsadress, SHA-256 och storlek. Det utlöser Cloudflares Git-integration. Releases skrivs inte över. Skyddad huvudbranch måste tillåta denna botuppdatering eller få pekaren uppdaterad via PR.
4. `npm run build` kör `prebuild`, som hämtar paketet om lokalt manifest saknas. Hela arkivets checksumma/storlek och manifestets samtliga filreferenser verifieras före installation. Fel stoppar bygget; ingen demo skapas som reserv. Därefter kopierar Vite data från `public/data` till `dist/data`.
5. `wrangler.jsonc` publicerar `dist` som statiska Workers Assets. `/data/manifest.json` blir riktig JSON. Saknade filer ger 404 i stället för att returnera appens HTML.

I **sliso → Settings → Build** i Cloudflare används:

| Inställning | Värde |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | repots rot |
| Production branch | `main` |

Cloudflares befintliga integration sköter autentiseringen. Ingen ny Cloudflare- eller Trafiklab-hemlighet behövs för detta flöde, och ingen R2-bucket krävs. Det publika datapaketet hämtas under bygget; besökare hämtar data från samma Cloudflare-origin som appen.

För första releasen med gångområden körs `prepare_walking=true`, `inventory_only=false` och `publish_release=true`. Senare tidtabellsbyggen återanvänder förberedd gångdata från Actions-cache; ändrade hållplatskoordinater stoppar bygget för omgranskning/ombyggnad. Om en release redan har gångområden men förberedelsecachen saknas stoppas bygget i stället för att tyst ta bort funktionen.

`npm run data:pull` tvingar en verifierad hämtning av den versionslåsta releasen även när lokal data finns. Vanligt `npm run build` bevarar befintlig lokal data, inklusive uttryckligt skapade testfixturer. Stora dataarkiv och `public/data` ska aldrig checkas in. En tidtabellsversion utan gångområden är cirka 77 MB komprimerad; gångkonturer och sparade tidigare versioner ökar arkivets storlek. De större gångindexen ryms fortfarande under 25 MiB per fil. Total storlek hindrar inte statisk publicering eftersom varje fil ligger under 25 MiB. Aktuell och tidigare sparade versioner paketeras tillsammans för redan öppna klienter.

Daglig hämtning aktiveras inte av detta. Kör ovanstående manuella flöde för en ny datarelease. För avsiktlig daglig uppdatering via Git-integrationen behövs både `SLISO_DATA_ENABLED=true` (bygga) och `SLISO_RELEASE_ENABLED=true` (publicera release och uppdatera pekaren). Ingendera aktiveras av kodändringen. Gamla GitHub Releases ligger kvar tills ägaren väljer en separat retentionspolicy; de är skilda från Actions-artefakternas korta retention.

## Alternativ: Cloudflare Pages från Actions

Appen är statisk: `npm run build`, utdatamapp `dist`. Alla riktiga data ska först finnas under `public/data`. För manuell deployment via Actions behövs:

- repository variable `SLISO_DEPLOY_ENABLED=true`;
- repository variable `CLOUDFLARE_ACCOUNT_ID`;
- repository secret `CLOUDFLARE_API_TOKEN`;
- Pages-projekt `sliso` och en manuell körning med `deploy=true`.

Dessa värden har inte konfigurerats av agenten. Ingen Worker, R2, betalplan eller publik reposynlighetsändring krävs. En eventuell deployment visar fortfarande utvecklingsmärkning så länge gångindexet har `reviewed=false`. Att koden bygger är inte ett pilotgodkännande.

CI behåller aktuell och senast föregående identifierade genererade dataversion. Det utökade gångnätet gör att tre fulla versioner skulle överskrida den tidigare arkivbudgeten 512 MiB vid kommande uppdateringar. Den redan publicerade övergångsreleasen med tre versioner är 524 355 920 byte, under gränsen 536 870 912 byte. `prune_data.py` tar bara bort kataloger med matchande generatorstämpel och version under angiven datarot; okända kataloger och symlänkar lämnas orörda. Klienter som hållits öppna länge och behöver en borttagen version måste ladda om; nya och gamla paket blandas aldrig.

## Mätt budget och kvarvarande kontokrav

| Resurs | Observerat / stoppregel |
| --- | --- |
| Trafiklab Bronze | Dokumenterade 50 hämtningar/månad; lokal spärr 45 försök och högst en lyckad hämtning per UTC-dag. Normal daglig trafik 28–31 hämtningar. Delad kontokvot kan bara kontoinnehavaren verifiera. |
| Statisk data | Cirka 225 MB okomprimerade index för 10 UTC-dygn i det första bygget; 5,76 miljoner förbindelser. Största filen cirka 9,6 MB. Aktuell + föregående version behålls i kommande byggen för att begränsa tillväxten. |
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


## Gångavstånd och områden

`prepare_walking.py` kör de befintliga OSM-/Valhalla-stegen och `walking_areas.py` med 30 konturer, 1–30 minuter, per automatiskt anslutet yttrafikläge. Första lokala körningen gav 1 041 lägen, 1 041 små filer och cirka 90 MB okomprimerade konturer på cirka 22 sekunder efter tilebygget. Inga konturarkiv, PBF-filer eller tiles ligger i Git. Manifestet refererar till checksummebundna filer; klienten hämtar bara filer för relevanta lägen med begränsad parallellitet. GeoJSON återanvänder samma gång-/tillträdesprofil som gångparen.

En gångytas färg anger total restid inklusive föregående färd och byte. Tillåten sista gång är det minsta av återstående restid och återstående budget för sammanhängande gång. Motorn bevarar även alternativa ankomster med mindre förbrukad gångbudget. Konturtiden avrundas nedåt till hela minuter. Första väntan är fortsatt utesluten ur restidsmåttet.

Konturer interpolerar räckvidden i gångnätet; de är **inte** en garanti för gångbarhet eller tillträde till varje punkt innanför polygonen. Även vatten, tomtmark och andra otillgängliga detaljer kan täckas av interpolation. Ytorna märks därför ungefärliga och täckningen ofullständig. Ingen cirkel eller fri plattformsanslutning används som ersättning. Gångområden ger inga klickbara adressrestider eller exakta resvägar till godtyckliga punkter. Gångavstånd i reselistan kommer från routningens faktiska nätlängd; tid multipliceras inte med en schablonhastighet för att skapa påstådda meter.

Vid gångombygge sparas nu Actions-artefakten `sliso-walking-audit` i sju dagar. Den redovisar återstående gångluckor, långa nätdetourer och utfallet för de rapporterade referensparen. En referensregression stoppar publicering; granska underlaget innan referensen ändras. Ingen geografisk genväg skapas för att passera kontrollen.


Den utökade vanliga vägåtkomsten använder nu en intern arkivgräns på 768 MiB
komprimerat och 3 GiB uppackat, med fortsatt högst två sparade versioner.
Cloudflares gränser på 25 MiB per fil och 20 000 filer gäller oförändrat.
Stora gångindex kodas kompakt utan att kasta kanter eller källhänvisningar,
och närliggande gångprofiler grupperas i begränsade shards. Arkivets byteantal,
SHA-256 och alla filers integritet kontrolleras före installation/publicering.

OSM-hämtningen har tre försök med högst 180 sekunders överföring per försök,
20 sekunders anslutningsgräns och avbrytning vid långvarigt låg överföringstakt.
Endast en fullständig SHA-256-verifierad fil får publiceras till källcachen;
avbrutna överföringar sparas separat och återupptas, men används inte av
gångbygget förrän hela filens checksumma stämmer. Felaktiga kompletta filer avvisas. Cachen ligger utanför Git.

Gångprofil v9 skiljer kartlagda gångpar från användarens antagna byten mellan
liknamniga lägen inom 250 meter. Ett byte av den regeln kräver ett nytt gångbygge
(`prepare_walking=true`) och publicering av ny datarelease, inte bara en ny
webbbyggnad. `assumedPairs` i byggrapporten ska redovisas separat från
`mappedPairs`; antagna passager räknas aldrig som godkända fysiska referenspar.

### Format-only contour migration

The manual **Migrate lossless contours** Actions workflow downloads and verifies
`data/release.json`, converts every contour with an exact coordinate round-trip
check, then publishes a new data release and `release.json` descriptor. It uses
GitHub's workflow token for the large asset upload. It makes no Trafiklab or OSM
request and preserves the previous immutable version. Normal future data builds
already emit the compressed fixed-point format; this migration is for older JSON
releases and refuses an already-compressed input.

After the job succeeds, download its `contour-release-descriptor` artifact (or the
release's `release.json` asset), verify the source version and release, then commit
the descriptor to `data/release.json`. Deploy the compatible frontend first. The
workflow does not change the pin automatically.
