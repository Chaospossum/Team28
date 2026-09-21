# Data sources (live-checked 2026-09-21)

| Source | URL / path | License | Resolution | Maastricht 50.85,5.69 | Rural 50.80,5.85 | Where |
|--------|------------|---------|------------|------------------------|------------------|-------|
| Open-Meteo Archive | `https://archive-api.open-meteo.com/v1/archive` | CC BY 4.0 | ~11 km | **Live** | **Live** | Frontend (frost/GDD/rain/sun) |
| Open-Meteo Climate | `https://climate-api.open-meteo.com/v1/climate` | CC BY 4.0 | model grid | **Live** EC_Earth3P_HR 1991–2020 & 2045–2050 | Not re-run | Frontend 2050 delta |
| SoilGrids v2.0 | `https://rest.isric.org/soilgrids/v2.0/properties/query` | CC BY 4.0 | 250 m | **Live/cache** | **Live** (slow) | Backend |
| PDOK BRO WMS | `https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0` | PDOK terms | 1:50k | **Live** | **Live** | Backend + `MapDraw.tsx` |
| 3DBAG | `https://api.3dbag.nl/collections/pand/items` | 3DBAG | LoD1.2 RD bbox | **Live** (~364/100 m) | **Live** | Backend; urban proxy |
| EcoCrop | `server/data/EcoCrop_DB.csv` | FAO/OpenCLIM | table | local | local | Backend |
| FungalRoot | `https://api.gbif.org/v1/occurrence/search?datasetKey=744edc21-8dd2-474e-8a0b-b8c3d56a3c2d` | CC BY 4.0 (GBIF) | ~1 km reports | **Live** (e.g. Lavandula AM) | Not re-run | `/api/fungi` |
| SPUN | `https://spun.org` | — | — | **No public API** (DNS from agent) | — | Panel: “no data here” |
| GlobalFungi API | `api.globalfungi.com` | — | — | **No host** | — | Not used |
| ESA WorldCover | `https://services.terrascope.be/wms/v2` | — | 10 m | **Failed** INTERNAL_ERROR | **Stopped** | Alt: 3DBAG proxy |
| CBS Bodemgebruik | `geodata.nationaalgeoregister.nl` | — | — | **Failed** DNS | **Stopped** | Alt: 3DBAG proxy |
| Pollinator / interactions | `server/data/*.csv` | cited subset | species | curated | curated | Backend |
| OSM tiles | `https://tile.openstreetmap.org` | ODbL | tiles | live | live | Frontend |

Cache files under `server/cache/` include `_cache.origin_url` and `_cache.fetched_at` (soil, fungi).
