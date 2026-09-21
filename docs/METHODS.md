# Methods

## Sun hours (estimate)

`sun_hours_per_day = mean_daily_shortwave_MJ / 2.68` (calibrated for NL; labeled estimate). Archive `sunshine_duration` shown separately (often inflated).

## Rain

Median of annual totals 2019–2023 from Open-Meteo Archive (modeled).

## Soil

ISRIC SoilGrids 0–5 cm mean; `d_factor` scaling. Nearby offset search if centroid null; distance in km ≈ degree offset × 111.

## Goals score (estimate)

After hard EcoCrop filters: `totalScore = goalScore − effortPenalty`. Goal weights from user sliders (pollinators / ornamental / food). Pollinator table from cited CSV; unknown = not zero.

## Effort (estimate)

Heuristic from EcoCrop `LIFO`/`LISPA` and user effort preset; see `server/goals.js`.

## 2050 climate

Open-Meteo Climate API 2045–2050, model EC_Earth3P_HR; no undocumented radiation multiplier.

## 3DBAG

EPSG:28992 bbox ±100 m around plot centroid; building heights from attributes (measured).

## Why / why not

Structured accept/reject lines with site numbers (`server/why.js`); cards attach `why_structured`. LLM may rank/rephrase when keyed; structured lines remain on the response.

## Urban proxy

When ESA WorldCover WMS fails, `buildingCount100m / 40` caps built-up fraction; class urban ≥15 buildings, suburban ≥5 in 100 m (3DBAG, measured).

## Shadow (Phase 3)

Web Worker (`sunGrid.worker.ts`) runs `computeSunGrid`: 1–2 m cells inside plot, cap 2000, 15 min rays on the 21st of each month. Building shadows: simplified ground shadow from footprint + height. Effective sun = geometric growing-season mean × clear-sky fraction (`archive sunshine / radiation hours`, else 0.65 default). User-drawn rectangles saved in share URL; heights editable in sidebar.

## Frost / GDD (Phase 4)

From archive daily `temperature_2m_min/max`: median frost days/year, spring/fall frost DOY percentiles, Apr–Sep GDD base 5°C (modeled).

## 2050 delta

Baseline `1991–2020` vs future `2045–2050`, model `EC_Earth3P_HR` only (multi-model list rejected by Climate API in live-check). Spread = min–max of growing-season means across future years. No radiation multiplier.

## Fungi

GBIF FungalRoot dataset key `744edc21-8dd2-474e-8a0b-b8c3d56a3c2d`; parses `Mycorrhiza type` measurement. Urban → low confidence label.

## LLM

When API key present: rephrase `why` only from `why_structured` facts; numeric validation drops hallucinated numbers.

## Guild

`server/data/interactions.csv` cited rows only; `/api/guild` suggests 3–6 names from goal-ranked shortlist with effort warn.
