/**
 * Minimal parsers for OpenFlights' `airports.dat` and `routes.dat`. Both are
 * headerless CSV with `\N` standing in for null. Airport/city names can contain
 * commas inside quoted fields, so a naive `split(',')` corrupts rows — hence the
 * small quote-aware line parser below rather than a dependency for two file formats.
 */

export type Airport = {
  id: number;
  name: string;
  city: string;
  /** Raw OpenFlights country name — see countryCodes.ts for the iso2 mapping. */
  country: string;
  iata: string | null;
  lat: number;
  lng: number;
};

export type Route = {
  sourceAirportId: number;
  destAirportId: number;
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

const NULL_TOKEN = '\\N';

function nullable(field: string | undefined): string | null {
  if (field === undefined) return null;
  return field === NULL_TOKEN || field === '' ? null : field;
}

/**
 * Columns: Airport ID, Name, City, Country, IATA, ICAO, Latitude, Longitude,
 * Altitude, Timezone, DST, Tz database time zone, Type, Source.
 */
export function parseAirports(raw: string): Airport[] {
  const airports: Airport[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    const id = Number(f[0]);
    const lat = Number(f[6]);
    const lng = Number(f[7]);
    if (!Number.isFinite(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    airports.push({
      id,
      name: f[1] ?? '',
      city: f[2] ?? '',
      country: f[3] ?? '',
      iata: nullable(f[4]),
      lat,
      lng,
    });
  }
  return airports;
}

/**
 * Columns: Airline, Airline ID, Source airport, Source airport ID, Destination
 * airport, Destination airport ID, Codeshare, Stops, Equipment.
 *
 * We key on the numeric airport IDs (columns 4 and 6) rather than IATA codes:
 * a handful of rows have a blank/`\N` IATA but a valid airport ID, and IDs are
 * unambiguous where a 3-letter code could theoretically collide.
 */
export function parseRoutes(raw: string): Route[] {
  const routes: Route[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line);
    const sourceAirportId = Number(f[3]);
    const destAirportId = Number(f[5]);
    if (!Number.isFinite(sourceAirportId) || !Number.isFinite(destAirportId)) continue;
    routes.push({ sourceAirportId, destAirportId });
  }
  return routes;
}
