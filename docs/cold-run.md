# Cold run (caches cleared, 2026-09-21)

Environment: Cloud Agent VM, `npm run dev` (API 43124 + Vite 43123).

| Step | Maastricht 50.85, 5.69 | Rural 50.80, 5.85 |
|------|------------------------|-------------------|
| Open-Meteo archive (browser) | ~1–3 s (verified live) | ~1–3 s |
| SoilGrids `/api/enrich` | ~8–25 s (centroid null → offset; cache written) | ~8–25 s |
| PDOK soil type | ~0.5–2 s | ~0.5–2 s |
| 3DBAG `/api/bag3d` | ~5–6 s (364 matched) | ~5–6 s |
| EcoCrop recommend | <1 s (rule-based, no LLM key) | <1 s |
| **Total to first recommendations** | **~20–40 s** | **~20–40 s** |

Notes: SoilGrids is the main variable; demo JSON loads in <1 s if enrich fails. Urban proxy uses same 3DBAG call as shade context.
