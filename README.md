# Right Plant, Right Place

Draw a garden plot on the map, pull climate and soil data for that spot, and get plant recommendations with structured “why” lines and honest data labels.

## Prerequisites

- Node.js 20+
- Optional: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env` for LLM re-ranking (otherwise EcoCrop rule-based reasons with structured why)

## Setup

```bash
npm install
cp .env.example .env   # add API key if you have one
```

## Run

```bash
npm run dev
npm test
```

- **App:** http://127.0.0.1:43123  
- **API:** http://127.0.0.1:43124  

Click **Load demo plot** for Maastricht (50.85°N, 5.69°E) or draw your own polygon. Share links encode polygon + goals (`?s=` lz-string).

## Data (verified live or cache — see `docs/DATA_SOURCES.md`)

| Source | Where |
|--------|--------|
| Open-Meteo Archive 2019–2023 | Browser |
| Open-Meteo Climate 2045–2050 (2050 toggle) | Browser |
| SoilGrids v2.0 (ISRIC, CC BY 4.0) | Backend, cache, nearby fallback + distance label |
| PDOK BRO Bodemkaart WMS | Backend GetFeatureInfo **and** frontend GetMap overlay (`MapDraw.tsx`) |
| 3DBAG building footprints | Backend `/api/bag3d` (EPSG:28992 bbox) |
| EcoCrop CSV (FAO) | Server startup |
| Pollinator / interaction tables | Cited CSV subsets in `server/data/` |
| OpenStreetMap tiles (ODbL) | Map basemap |

**Sun class:** radiation-based hour estimate (MJ÷2.68), labeled estimate; EcoCrop `LIMN`/`LIMX` on explain bars when present.

**Urban context:** 3DBAG count proxy (WorldCover WMS live-check failed — documented).

**Fungi / SPUN:** not integrated — no data shown.

If APIs fail, `public/demo-maastricht.json` is used automatically.

## Docs

- `docs/DATA_SOURCES.md` — URLs, licenses, live-check notes  
- `docs/METHODS.md` — formulas and assumptions  
- `docs/cold-run.md` — timed cold-run notes  

## Honesty

Every number should cite source, resolution/distance, and measured vs modeled vs estimate. Missing layers show **“no data here”**. Soil ≈250 m; climate ≈km — neighbourhood estimate, not a soil test.
