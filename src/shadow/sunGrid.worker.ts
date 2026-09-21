import { computeSunGrid, type PlotBuilding, type SunGridResult } from './gridCore'

export type SunGridWorkerRequest = {
  polygonRing: number[][] 
  originLat: number
  originLon: number
  buildings: PlotBuilding[]
  clearSkyFraction: number
}

self.onmessage = (ev: MessageEvent<SunGridWorkerRequest>) => {
  const result: SunGridResult = computeSunGrid(ev.data)
  self.postMessage(result)
}
