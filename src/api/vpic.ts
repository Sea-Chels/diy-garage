/**
 * NHTSA vPIC: free, keyless, CORS-enabled vehicle data.
 * https://vpic.nhtsa.dot.gov/api/
 */
const BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';
const cache = new Map<string, Promise<string[]>>();

export function modelsForMakeYear(make: string, year: number): Promise<string[]> {
  const key = `${make}|${year}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`${BASE}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`)
      .then((r) => {
        if (!r.ok) throw new Error(`vPIC ${r.status}`);
        return r.json() as Promise<{ Results: { Model_Name: string }[] }>;
      })
      .then((j) => {
        const names = new Set(j.Results.map((m) => m.Model_Name.trim()).filter(Boolean));
        return [...names].sort((a, b) => a.localeCompare(b));
      });
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}
