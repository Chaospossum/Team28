# Right Plant, Right Place

Draw a garden plot on the map, pull climate and soil data for that spot, and get eight plant recommendations with plain-language reasons.

## Prerequisites

- Node.js 20+
- Optional: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env` for LLM ranking (otherwise EcoCrop + site-aware rule-based reasons)

## Setup

```bash
npm install
cp .env.example .env   # add API key if you have one
```

## Run

```bash
npm run dev
```

- **App:** http://127.0.0.1:43123  
- **API:** http://127.0.0.1:43124  

Click **Load demo plot** for Maastricht (50.85°N, 5.69°E) or draw your own polygon.

## Data

| Source | Where |
|--------|--------|
| Open-Meteo Archive 2019–2023 | Browser (CORS) |
| SoilGrids v2.0 | Backend proxy, cache, retries + nearby fallback |
| PDOK BRO Bodemkaart (bzk WMS, EPSG:28992) | Backend proxy |
| EcoCrop CSV | Loaded at server startup |
| LLM | Backend only, optional |

**Sun class** uses a radiation-based hour estimate (MJ÷2.68). Archive `sunshine_duration` is shown for transparency but is often inflated.

**Rain** uses the **median** of annual totals across 2019–2023.

If APIs fail, `public/demo-maastricht.json` is used automatically (also refreshed after a successful demo run).

## Phase 5 features

- Plot score (0–100, estimate) with animated ring
- Map layers: radiation polygon tint, PDOK soil WMS, NDVI **sample** overlay (Copernicus OAuth skipped)
- Explain bars (sun / rain / pH), water-saving estimate, planting calendar (heuristic)
- Climate **2050** toggle (Open-Meteo Climate API + cached fallback)
- Share link + PDF export; EN/NL/FR/DE UI strings
- Demo recording: `docs/demo.webm`

## Honesty

Soil ≈250 m resolution; climate ≈km scale. Neighbourhood estimate — not a soil test.
