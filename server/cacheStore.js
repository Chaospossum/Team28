/**
 * Pluggable JSON cache for soil/fungi lookups. No-op by default (browser build);
 * server/index.js installs the disk store from server/diskCache.js.
 */
let store = { read: () => null, write: () => {} }

export function setCacheStore(next) {
  store = next
}

export function cacheRead(name) {
  return store.read(name)
}

export function cacheWrite(name, data) {
  store.write(name, data)
}
