# Västerledstorget och Grenvägen

Referenssökning: Skärvik `9022001015503003`, 2026-10-20 kl. 06:12,
120 min restid, 15 min sammanhängande gång, 4 byten, 30 min avgångsfönster,
alla trafikslag. Publicerat referensdataset före rättningen:
`sl-de5730e69f55bcd032d6`.

| Hållplatsläge | Före, sekunder (avrundat) | Lokalt korrigerat, sekunder (avrundat) |
| --- | ---: | ---: |
| Västerledstorget 1, mot Alvik | 4246 (71 min) | 3948 (66 min) |
| Västerledstorget 2, mot Abrahamsberg | 5245 (88 min) | 3941 (66 min) |
| Grenvägen 1, mot Alvik | 3071 (52 min) | 3071 (52 min) |
| Grenvägen 2, mot Spånga station | 4965 (83 min) | 3128 (53 min) |

Tre generella fel låg bakom:

1. Flera OSM-hållplatser ligger inom 25 meter från samma GTFS-läge. Den gamla
   regeln förkastade varje tvetydigt läge var för sig i stället för att lösa en
   gemensam tilldelning mellan riktningarna. Vid Grenvägen blockerade en sådan
   kandidat också det andra läget som en påstådd dubbelanvändning.
2. Flera gångvägar vid samma lilla korsning behandlades som en oklar vägkoppling,
   trots att deras riktiga grafnoder är förenade bara några meter bort. Den nya
   kontrollen skiljer ett sammanhängande korsningsnät från olika nivåer/passager.
3. Västerled, en normal gata med 40 km/h, uteslöts eftersom explicit `foot=yes`
   eller trottoartagg saknades. Efter enbart hållplatsmatchning gav nätet därför
   1 148 meters gång mellan lägena. Korrekt standardåtkomst för vanliga
   låg­hastighetsgator ger den korta fysiska nätvägen utan en påhittad rak kant.

Rättningen är generell; inga hållplatsnamn eller ID:n styr tilldelnings- eller
routningsalgoritmen. Nätvägen mellan Västerledstorgets lägen är 108 meter /
81 sekunder inklusive koordinatavvikelser. Grenvägens motsvarande väg är
76 meter / 57 sekunder. Den tidigare Skorpvägen-/Ankarstocksvägen- och
Runstensplan-datan ingår i regressionsgrinden.

Den lokala nätrevisionen flaggar dessutom saknade och extremt långa
förbindelser vid andra närliggande lägen. Rapporterna är prioriteringsunderlag,
inte bevis på att varje saknad passage är gångbar. Appens resedetaljer varnar
nu särskilt när destinationens hållplatsläge saknar gånganslutningsdata.
Se [metoden](../data/README.md) och Actions-artefakten `sliso-walking-audit`.
