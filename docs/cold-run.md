# Cold run (2026-09-21)

| Step | Maastricht demo 50.872, 5.668 | Rural 50.80, 5.85 |
|------|------------------------|-------------------|
| Open-Meteo archive | ~1–3 s | ~1–3 s |
| SoilGrids enrich | ~8–25 s | ~8–25 s |
| 3DBAG | ~5–6 s | ~5–6 s |
| Sun grid worker (≤2000 cells) | ~0.5–2 s | ~0.5–2 s |
| EcoCrop + zone recommends | ~1–3 s | ~1–3 s |
| FungalRoot GBIF (per plant) | ~0.5–1 s | — |
| **Total** | **~20–45 s** | **~20–40 s** |

Demo JSON still <1 s if APIs fail.
