# Right Plant, Right Place

**Live demo:** https://chaospossum.github.io/Team28/

| | |
|---|---|
| **Team name** | Team 28 |
| **Team members** | Daniil Liazhdzei, Nicole Duque, Sebastian Steven Alexander van der Chijs |
| **Track** | Track 02 — AI for Good (Human Centred) |
| **Project name** | Right Plant, Right Place |

### Short description
Draw your garden, balcony or facade strip on a map. Right Plant, Right Place combines the local climate (rain and sun, today and projected for 2050) with soil data to recommend plants that will actually thrive there. Every recommendation comes with a plain-language explanation of why it fits, plus the water it needs and a planting calendar.

### What problem we solve
People want to green their city (more biodiversity, cooler streets, less paving), but most don't know what will grow in *their* spot, so plants die, money is wasted and people give up. Garden-centre advice is generic and ignores local soil and climate change. Maastricht has only 29 trees per 100 residents against a national average of 52 (Gemeente Maastricht). We turn open climate and soil data into site-specific, explained advice anyone can use in under a minute.

---

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
