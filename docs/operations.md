# Drift, kvoter och publicering

Inget har driftsatts, betalprodukt aktiverats, repo gjorts publikt eller hemlighet skickats till någon tjänst. Cloudflare Pages är vald distributionsväg; deployment är en separat uttrycklig driftåtgärd.

## Konfiguration

- `TRAFIKLAB_GTFS_KEY`: bygg-/CI-hemlighet med åtkomst till GTFS Regional SL. Sätt som GitHub Actions repository secret. Ingen frontendnyckel behövs.
- `data/walking-graph.json`: granskat gångunderlag enligt [data.md](data.md). Den filen saknas avsiktligt tills verkligt underlag finns.
- `SLISO_DATA_ENABLED=true`: opt-in GitHub repository variable för den dagliga datapipelinen. Standard är av.
- `SLISO_DEPLOY_ENABLED=true`: separat opt-in för Cloudflare-publicering. Kräver `CLOUDFLARE_API_TOKEN` som repository secret och `CLOUDFLARE_ACCOUNT_ID` som repository variable. Projektet `sliso` måste finnas i Pages. Ingen repository-hemlighet får checkas in.
- `VITE_TILE_URL`, `VITE_TILE_ATTRIBUTION`: publika byggvariabler för utbytbara karttiles. Standard är OSM standardtiles. `none` stänger av bakgrundskartan. Inget adress-API används.

## Första riktiga databyggningen

Verifiera först återstående Trafiklab-kvot och licens/distributionsrätt. Kör lokalt med nyckeln säkert tillförd i processen, eller välj det manuella CI-flödets `initialize_quota_ledger` efter att gånggrafen lagts till. Ange aldrig nyckeln som kommandoradsargument eller i en URL i loggar.

```sh
python scripts/fetch_gtfs.py --output .data-build/sl.zip --ledger .data-build/quota.json --init-ledger
python scripts/build_walks.py --graph data/walking-graph.json --output .data-build/walks.json
python scripts/build_data.py --gtfs .data-build/sl.zip --walks .data-build/walks.json
npm test
npm run test:python
npm run build
```

Hämtningens officiella endpoint är konfigurerad för `opendata.samtrafiken.se/gtfs/sl/sl.zip`. Den har inte testats med en giltig nyckel här. Aktuell leverantörsdokumentation och kontoåtkomst måste kontrolleras innan automatisering aktiveras.

## Daglig pipeline

`data.yml` är schemalagd 03.17 UTC, villkorad av `SLISO_DATA_ENABLED`. Den återställer kvotledger och föregående paket, hämtar högst en gång per UTC-datum, bygger gångpar och tidtabell, testar och bygger appen samt sparar ett kortlivat dist-artefakt. Kvotledger sparas med `always()` även efter misslyckad hämtning. Saknad ledger stoppar nätanrop i stället för att skapa en ny kvot tyst. Cacheförlust kräver en uttrycklig ny initiering efter kontroll av kontots kvarvarande kvot.

Publicering görs bara om **även** `SLISO_DEPLOY_ENABLED=true`. Fram till dess är CI-resultatet ett artefakt för granskning. Misslyckad hämtning, validering eller byggning når inte publiceringssteget. Den befintliga Pages-versionen fortsätter då att fungera inom sin datagiltighet, med synlig varning för äldre data. Utgången data går inte att söka på; datum ändras inte automatiskt.

## Kvotbudget och stoppregler

| Resurs | Plan / stoppregel | Verifieringsstatus |
| --- | --- | --- |
| Trafiklab Bronze | 50 hämtningar/mån enligt kravspecen; lokal spärr 45 försök/mån, återanvändning inom dygnet. Normal daglig körning 28–31 försök. Misslyckade försök räknas också. Ingen betald fallback. | Lokal kvotmekanism testad med mockad nättrafik; abonnemangsvillkor ej nykontrollerade. |
| Delad API-nyckel | Ledger gäller bara denna pipeline. Andra klienter kan förbruka samma kvot; dela inte nyckeln utan gemensam bokföring. Vid osäker restkvot: stoppa schemat. | Kräver driftbeslut. |
| Cloudflare Pages | Statiska filer, inga Workers/R2. Filgräns 25 MiB kontrolleras i byggaren. Fullt projekt måste understiga 20 000 filer; deployment kan stoppas av leverantören. Cirka 31 planerade databyggen/mån plus kodbyggen, mot 500 byggen/mån som planeringsgrund. | Ingen deployment utförd; villkor måste kontrolleras. |
| GitHub Actions | Dagligen, timeout 20 min; upp till ca 620 min/mån om varje körning når taket. Privat repos fria minuter och cache/artefaktlagring måste kontrolleras. Avaktivera fakturerad överförbrukning i kontot. | Ingen faktisk fullskalig körtid/minnesåtgång verifierad. Aktivering avstängd. |
| Cache/artefakt | CI behåller äldre dataset; artefakt retention 3 dagar. Övervaka/avaktivera innan kontoöverskridande och rensa äldre versioner utanför aktiv klienthorisont. Ingen automatisk uppgradering. | Ingen fullskalig lagringsmätning. |
| Karttiles | Vanlig interaktiv användning, synlig attribution, inga tile-prefetch/offline-cache-loopar. HTTP-cache sköts av webbläsaren. Vid fel fungerar hållplatskartan utan bakgrund. | Aktuell OSM-policy och publik kapacitet måste verifieras; miljön blockerade HTTP-kontrollen. |
| Sökning | Lokal worker, inget backend-/gång-/adress-API per sökning. Vid 2 miljoner skapade tillstånd stoppar motorn med ofärdigt resultat. Avbrytning terminerar processen. | Testad på syntetiskt nät; regionprestanda ej känd. |

En lokal ledger kan inte garantera leverantörskvot när samma konto används av andra system. GitHub Actions kontoövergripande spend limit är en driftförutsättning, inte något källkod kan verkställa åt kontoinnehavaren. Detta måste konfigureras före aktivering; ingen kodväg använder betald reservtjänst.

## Nätverk, integritet och licenser

Runtime: samma ursprung för app/data, valfri tilevärd. Byggmiljön behöver npm-registret och Trafiklabs filvärd. Vald gångkälla kan kräva separat OSM-hämtning offline. HTTPS-/checksumkontroller får aldrig stängas av för att få hämtning att fungera.

Delningslänkar använder fragmentet och skickas normalt inte till webbservern; en kopierad länk avslöjar ändå start och alla inställningar för mottagaren. Ingen analys, central historik, geolokalisering eller inloggning ingår. Typsnitt ligger i apppaketet.

OSM-licens/ODbL och trafikdatans vidareförmedlingsvillkor måste granskas mot det faktiskt publicerade underlaget. Manifestet bär källangivelser; bakgrundskartans attribution visas alltid utanför mobilpanelen. Påstå inte fullständig SL-täckning innan linjeinventering och referensresor granskats.
