import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { setEcoCropCsv } from './ecocrop.js'
import { setPollinatorCsv } from './goals.js'
import { setInteractionsCsv } from './guild.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function read(name) {
  return fs.readFileSync(path.join(__dirname, 'data', name), 'utf8')
}

/** Node-only: load the CSV tables from server/data. */
export function loadEcoCrop() {
  const n = setEcoCropCsv(read('EcoCrop_DB.csv'))
  console.log(`[ecocrop] loaded ${n} species`)
}

export function loadPollinatorCsv() {
  setPollinatorCsv(read('pollinator_value.csv'))
}

export function loadInteractions() {
  setInteractionsCsv(read('interactions.csv'))
}
