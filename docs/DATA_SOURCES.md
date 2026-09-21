# Data sources (live-checked 2026-09-21)

| Source | URL / path | License | Resolution | Maastricht 50.85,5.69 | Rural 50.80,5.85 | Where |
|--------|------------|---------|------------|------------------------|------------------|-------|
| Open-Meteo Archive | `https://archive-api.open-meteo.com/v1/archive` | CC BY 4.0 | ~11 km | **Live:** archive responds; median rain multi-year in app | **Live:** archive responds | Frontend |
| Open-Meteo Climate | `https://climate-api.open-meteo.com/v1/climate` | CC BY 4.0 | model grid | **Live:** 2045–50 EC_Earth3P_HR | Not re-run this session | Frontend |
| SoilGrids v2.0 | `https://rest.isric.org/soilgrids/v2.0/properties/query` | CC BY 4.0 | 250 m | **Live:** phh2o query returns; centroid often null → nearby offset | **Live:** query works (slow) | Backend |
| PDOK BRO (GetFeatureInfo) | `https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0` | PDOK terms | 1:50k | **Live:** often no polygon at centroid | **Live:** varies by point | Backend |
| PDOK WMS GetMap | same | PDOK terms | 1:50k | overlay | overlay | Frontend `MapDraw.tsx` |
| 3DBAG | `https://api.3dbag.nl/collections/pand/items` | 3DBAG license | LoD1.2, EPSG:28992 bbox | **Live:** 364 matched in 100 m RD buffer | **Live:** buildings returned | Backend `/api/bag3d` |
| EcoCrop | `server/data/EcoCrop_DB.csv` | FAO/OpenCLIM | species table | local | local | Backend |
| Pollinator values | `server/data/pollinator_value.csv` | RHS / NL lists (hand-cited subset) | species match | curated | curated | Backend |
| Interactions | `server/data/interactions.csv` | cited rows only | — | curated | curated | Backend `/api/guild` |
| OSM tiles | `https://tile.openstreetmap.org` | ODbL | tiles | live | live | Frontend |
| NDVI sample | `public/ndvi-sample.svg` | app placeholder | — | not Copernicus | — | Frontend |
| ESA WorldCover | `https://services.terrascope.be/wms/v2` | — | 10 m | **Failed:** WMS GetFeatureInfo INTERNAL_ERROR | **Stopped** | Alternative: 3DBAG density proxy in `server/urban.js` |
| SPUN / FungalRoot | — | — | — | **Not integrated** (stopped) | — | Panel would show “no data here” |
| Demo JSON | `public/demo-maastricht.json` | app | — | cache fallback | cache | Frontend |

Cache files under `server/cache/` include `_cache.origin_url` and `_cache.fetched_at` when written after enrichment.
