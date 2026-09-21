import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(__dirname, 'cache')

/** Node-only store for cacheStore.js: server/cache/<name>.json */
export const diskCacheStore = {
  read(name) {
    const file = path.join(CACHE_DIR, `${name}.json`)
    if (!fs.existsSync(file)) return null
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  },
  write(name, data) {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(path.join(CACHE_DIR, `${name}.json`), JSON.stringify(data, null, 2))
  },
}
