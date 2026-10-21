# Solbacka och Sundby by

Användarens delade sökning: Skärvik, läge 9022001015503003, 2026-10-21
08.07, 120 minuter, 15 minuters gång, tre byten och 30 minuters avgångsfönster.

| Stoppområde | Publicerad före rättning | Nytt gångnät med samma tidtabell |
| --- | --- | --- |
| Solbacka på Färingsö | 48 / 105 minuter | 48 / 49 minuter |
| Sundby by | 54 / 101 minuter | 54 / 54 minuter |

Solbackavägen (`secondary`, 50 km/h, cirka 5,2–5,5 meter bred) saknades i
profilen trots normal gångåtkomst. Vanliga primär-/sekundärvägar inkluderas nu
med samma tillträdeskontroller som övriga vanliga vägar; motorvägar,
motortrafikleder och gångförbud förblir uteslutna.

Dessutom skiljer sig busshållplatsernas GTFS- och OSM-positioner. I stället
för att flytta dem godtyckligt godkänns en liten projektion av det officiella
GTFS-läget till ett topologiskt verifierat gångnät. Ett OSM-identifierat syskon
måste finnas i samma GTFS-stoppområde, och det måste finnas riktig gångväg i
båda riktningar inom 250 meter. Alla anslutningsavvikelser kostar tid och längd.

Solbackas två lägen binds över 74 meter / 56 sekunder. Sundby by får
71 meter / 54 sekunder. Dessa par läggs till de tidigare referenserna; bygget
stoppar om någon riktning saknas eller överskrider fem minuter.

Underlaget är fortsatt partiellt och inte platsgranskat. Lokalt har den låsta
OSM-extrakten routats med Valhalla och jämförts mot de publicerade
2026-10-21-paketen. CI gör om kontrollerna mot dagens feed före publicering.
