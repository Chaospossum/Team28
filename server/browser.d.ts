export type ApiResult = { status: number; body: unknown }
export const routes: Record<
  string,
  (query: Record<string, string>, body: unknown) => Promise<ApiResult>
>
export function loadCsvTables(tables: {
  ecocrop: string
  pollinators: string
  interactions: string
}): void
