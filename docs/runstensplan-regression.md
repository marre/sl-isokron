# Runstensplan: omväg via Islandstorget

Användarens sökning: Skärvik `9022001015503003`, 2026-10-20 kl. 06:12,
120 min restid, 15 min sammanhängande gång, 4 byten, 30 min avgångsfönster,
alla trafikslag. Referensdataset före rättning: `sl-3674cd8b320a7639880d`.

| Runstensplan-läge | Före (sekunder) | Visat före |
| --- | ---: | ---: |
| `9022001012169001`, mot Blackebergs gård | 4680 | 78 min |
| `9022001012169002`, mot Karolinska sjukhuset / Solna centrum | 5433 | 91 min |

Läge 2 nåddes med buss 113 förbi Runstensplan till Islandstorget, gång mellan
Islandstorgets busslägen och en ny buss 113 tillbaka till Runstensplan.
Gångkoppling mellan Runstensplans riktningar saknades fortfarande.

Tidigare rättning var otillräcklig: GTFS-läge 1 ligger mellan två olika
OSM-gångvägar, cirka 6,6 respektive 6,8 meter bort. En större sökradie från samma
GTFS-punkt skulle inte avgöra rätt väg. Läge 2 ligger bara 1,4 meter från en
väg men cirka 10,3 meter från OSM-hållplatsen och föll utanför den tidigare
identitetsgränsen 10 meter.

Den nya profilen kan identifiera respektive namngivna OSM-busshållplats inom
25 meter och använder sedan den positionen för anslutning till gångnätet.
Vid läge 1 ligger OSM-nod `1823992068` 1,5 meter från en enda gångväg; vid
läge 2 ligger OSM-nod `1823992041` 0,1 meter från en enda gångväg. Nodidentitet,
lägeskod, unik tilldelning, tillträdesbegränsningar och koordinatavvikelse
kontrolleras; detta är inte ett generellt byte till närmaste väg.

Beräknad gång mellan lägena är 126 meter / 95 sekunder inklusive de
konservativa koordinatavvikelserna. Med det kompletterade nätet finns även
ett tidigare byte via Bromma kyrka–Spångavägen: buss 177 till Brommaplan,
buss 117 till Bromma kyrka, cirka 1 084 meter / 813 sekunder gång till
Spångavägen, buss 113 till Runstensplan. Den avslutande promenaden till
motsatt läge ryms inom gånggränsen, som återställs efter bussresan.

Kontroll mot användarens tidtabell och ett lokalt ombyggt gångnät gav 3 720
sekunder (62 minuter) till läge 1 och 3 815 sekunder (64 minuter) till läge 2.
Produktionsbygget räknar om samma profil mot den aktuella feeden och ska
kontrolleras på publicerade filer efter utrullning.

Automatiska regressioner täcker den verkliga koordinatkonflikten, rätt
OSM-väg från identifierad hållplatsposition samt nekad koppling vid fel namn,
fel lägeskod, för stor avvikelse, flera kandidater och känt gångförbud.
Befintliga tester för kort gång kontra bussomväg, vattenhinder, sammanhängande
gångbudget och konturernas anslutningskostnad kvarstår. Detta är inte en
manuell granskning av alla stationers gånganslutningar.
