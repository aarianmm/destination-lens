/**
 * Vendored world polygon geometry (Natural Earth 1:110m admin-0 countries),
 * trimmed to `{ iso2, name }` properties + rounded coordinates. Lives in
 * `app/public/geo/` so the deployed app never fetches geometry from a CDN.
 *
 * A couple of contested territories (Northern Cyprus, Somaliland) have no ISO
 * alpha-2 code in the source data; their `iso2` is `null` and they render as
 * inert geometry rather than being force-mapped onto a neighbour's code.
 */

export type CountryFeature = {
  type: 'Feature';
  properties: { iso2: string | null; name: string };
  geometry: { type: string; coordinates: unknown };
};

export type CountryFeatureCollection = {
  type: 'FeatureCollection';
  features: CountryFeature[];
};

let cached: Promise<CountryFeature[]> | undefined;

export function loadCountryPolygons(): Promise<CountryFeature[]> {
  if (!cached) {
    cached = fetch('/geo/world-110m.json')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load /geo/world-110m.json: ${res.status}`);
        return res.json() as Promise<CountryFeatureCollection>;
      })
      .then((fc) => fc.features);
    cached.catch(() => {
      cached = undefined;
    });
  }
  return cached;
}
