/** Browser entry for the static build (src/browserApi.ts): route logic + CSV setters, no Node imports. */
import { setEcoCropCsv } from './ecocrop.js'
import { setPollinatorCsv } from './goals.js'
import { setInteractionsCsv } from './guild.js'

export { routes } from './api.js'

export function loadCsvTables({ ecocrop, pollinators, interactions }) {
  setEcoCropCsv(ecocrop)
  setPollinatorCsv(pollinators)
  setInteractionsCsv(interactions)
}
