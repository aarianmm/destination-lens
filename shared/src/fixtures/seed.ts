/**
 * Seed data for the FIXTURE generator only.
 *
 * This is deliberately separate from `shared/vocab/**` (Agent D's hand-curated,
 * research-verified monitoring vocabulary). Coordinates here are approximate and
 * exist purely so the UI has something plausible to render before the real
 * pipeline exists. Do not use this file as a data source in the pipeline.
 */

export type SeedDestination = { slug: string; name: string; lat: number; lng: number };
export type SeedCountry = {
  iso2: string;
  name: string;
  centroid: { lat: number; lng: number };
  bounds: { north: number; south: number; east: number; west: number };
  destinations: SeedDestination[];
};

const d = (slug: string, name: string, lat: number, lng: number): SeedDestination => ({
  slug,
  name,
  lat,
  lng,
});

export const SEED_COUNTRIES: SeedCountry[] = [
  {
    iso2: 'TH',
    name: 'Thailand',
    centroid: { lat: 13.0, lng: 101.0 },
    bounds: { north: 20.5, south: 5.6, east: 105.7, west: 97.3 },
    destinations: [
      d('bangkok', 'Bangkok', 13.7563, 100.5018),
      d('phuket', 'Phuket', 7.8804, 98.3923),
      d('chiang-mai', 'Chiang Mai', 18.7883, 98.9853),
      d('krabi', 'Krabi', 8.0863, 98.9063),
      d('koh-samui', 'Koh Samui', 9.512, 100.0136),
      d('koh-lanta', 'Koh Lanta', 7.62, 99.04),
      d('pai', 'Pai', 19.3583, 98.44),
      d('hua-hin', 'Hua Hin', 12.5684, 99.9577),
    ],
  },
  {
    iso2: 'JP',
    name: 'Japan',
    centroid: { lat: 36.2, lng: 138.2 },
    bounds: { north: 45.5, south: 24.0, east: 146.0, west: 122.9 },
    destinations: [
      d('tokyo', 'Tokyo', 35.6762, 139.6503),
      d('kyoto', 'Kyoto', 35.0116, 135.7681),
      d('osaka', 'Osaka', 34.6937, 135.5023),
      d('hakone', 'Hakone', 35.2324, 139.1069),
      d('kanazawa', 'Kanazawa', 36.5613, 136.6562),
      d('sapporo', 'Sapporo', 43.0618, 141.3545),
      d('naoshima', 'Naoshima', 34.4589, 133.995),
      d('nara', 'Nara', 34.6851, 135.8048),
    ],
  },
  {
    iso2: 'VN',
    name: 'Vietnam',
    centroid: { lat: 16.0, lng: 106.0 },
    bounds: { north: 23.4, south: 8.2, east: 109.5, west: 102.1 },
    destinations: [
      d('hanoi', 'Hanoi', 21.0278, 105.8342),
      d('ho-chi-minh-city', 'Ho Chi Minh City', 10.8231, 106.6297),
      d('hoi-an', 'Hoi An', 15.8801, 108.338),
      d('da-nang', 'Da Nang', 16.0544, 108.2022),
      d('ha-long-bay', 'Ha Long Bay', 20.9101, 107.1839),
      d('sapa', 'Sapa', 22.3364, 103.8438),
      d('phu-quoc', 'Phu Quoc', 10.2899, 103.984),
      d('ninh-binh', 'Ninh Binh', 20.2506, 105.9745),
    ],
  },
  {
    iso2: 'ID',
    name: 'Indonesia',
    centroid: { lat: -2.5, lng: 118.0 },
    bounds: { north: 5.9, south: -11.0, east: 141.0, west: 95.0 },
    destinations: [
      d('bali', 'Bali', -8.4095, 115.1889),
      d('ubud', 'Ubud', -8.5069, 115.2625),
      d('lombok', 'Lombok', -8.5833, 116.1167),
      d('yogyakarta', 'Yogyakarta', -7.7956, 110.3695),
      d('raja-ampat', 'Raja Ampat', -0.5, 130.5),
      d('komodo', 'Komodo', -8.55, 119.4833),
      d('canggu', 'Canggu', -8.6478, 115.1385),
      d('flores', 'Flores', -8.6574, 121.0794),
    ],
  },
  {
    iso2: 'BR',
    name: 'Brazil',
    centroid: { lat: -14.2, lng: -51.9 },
    bounds: { north: 5.3, south: -33.8, east: -28.8, west: -74.0 },
    destinations: [
      d('rio-de-janeiro', 'Rio de Janeiro', -22.9068, -43.1729),
      d('sao-paulo', 'São Paulo', -23.5505, -46.6333),
      d('salvador', 'Salvador', -12.9747, -38.4767),
      d('florianopolis', 'Florianópolis', -27.5954, -48.548),
      d('iguacu-falls', 'Iguaçu Falls', -25.6953, -54.4367),
      d('fernando-de-noronha', 'Fernando de Noronha', -3.855, -32.4239),
      d('paraty', 'Paraty', -23.2178, -44.7131),
      d('jericoacoara', 'Jericoacoara', -2.7975, -40.5129),
    ],
  },
  {
    iso2: 'PE',
    name: 'Peru',
    centroid: { lat: -9.2, lng: -75.0 },
    bounds: { north: -0.04, south: -18.35, east: -68.68, west: -81.33 },
    destinations: [
      d('lima', 'Lima', -12.0464, -77.0428),
      d('cusco', 'Cusco', -13.532, -71.9675),
      d('machu-picchu', 'Machu Picchu', -13.1631, -72.545),
      d('arequipa', 'Arequipa', -16.409, -71.5375),
      d('paracas', 'Paracas', -13.8455, -76.2497),
      d('huacachina', 'Huacachina', -14.0873, -75.7635),
      d('mancora', 'Máncora', -4.1044, -81.0464),
      d('lake-titicaca', 'Lake Titicaca', -15.9254, -69.3354),
    ],
  },
  {
    iso2: 'ZA',
    name: 'South Africa',
    centroid: { lat: -30.6, lng: 22.9 },
    bounds: { north: -22.1, south: -34.8, east: 32.9, west: 16.5 },
    destinations: [
      d('cape-town', 'Cape Town', -33.9249, 18.4241),
      d('johannesburg', 'Johannesburg', -26.2041, 28.0473),
      d('durban', 'Durban', -29.8587, 31.0218),
      d('kruger', 'Kruger National Park', -23.9884, 31.5547),
      d('stellenbosch', 'Stellenbosch', -33.9321, 18.8602),
      d('garden-route', 'Garden Route', -34.0363, 23.0471),
      d('hermanus', 'Hermanus', -34.4187, 19.2345),
      d('drakensberg', 'Drakensberg', -29.4271, 29.3717),
    ],
  },
  {
    iso2: 'KE',
    name: 'Kenya',
    centroid: { lat: -0.02, lng: 37.9 },
    bounds: { north: 5.02, south: -4.68, east: 41.9, west: 33.91 },
    destinations: [
      d('nairobi', 'Nairobi', -1.2921, 36.8219),
      d('mombasa', 'Mombasa', -4.0435, 39.6682),
      d('diani-beach', 'Diani Beach', -4.3167, 39.5667),
      d('maasai-mara', 'Maasai Mara', -1.5, 35.1435),
      d('lamu', 'Lamu', -2.2717, 40.902),
      d('watamu', 'Watamu', -3.3535, 40.0223),
      d('lake-nakuru', 'Lake Nakuru', -0.36, 36.08),
      d('amboseli', 'Amboseli National Park', -2.6527, 37.2606),
    ],
  },
  {
    iso2: 'MX',
    name: 'Mexico',
    centroid: { lat: 23.6, lng: -102.5 },
    bounds: { north: 32.7, south: 14.5, east: -86.7, west: -118.4 },
    destinations: [
      d('mexico-city', 'Mexico City', 19.4326, -99.1332),
      d('tulum', 'Tulum', 20.2114, -87.4654),
      d('oaxaca', 'Oaxaca', 17.0732, -96.7266),
      d('puerto-escondido', 'Puerto Escondido', 15.872, -97.0767),
      d('guadalajara', 'Guadalajara', 20.6597, -103.3496),
      d('san-miguel-de-allende', 'San Miguel de Allende', 20.9153, -100.7439),
      d('merida', 'Mérida', 20.9674, -89.5926),
      d('bacalar', 'Bacalar', 18.6767, -88.3956),
    ],
  },
  {
    iso2: 'MA',
    name: 'Morocco',
    centroid: { lat: 31.8, lng: -7.1 },
    bounds: { north: 35.9, south: 27.7, east: -1.0, west: -13.2 },
    destinations: [
      d('marrakesh', 'Marrakesh', 31.6295, -7.9811),
      d('chefchaouen', 'Chefchaouen', 35.1688, -5.2636),
      d('fes', 'Fes', 34.0181, -5.0078),
      d('essaouira', 'Essaouira', 31.5085, -9.7595),
      d('taghazout', 'Taghazout', 30.545, -9.71),
      d('merzouga', 'Merzouga', 31.0996, -4.0122),
      d('tangier', 'Tangier', 35.7595, -5.834),
      d('imlil', 'Imlil', 31.1361, -7.9195),
    ],
  },
];

/** Origin markets used to synthesise plausible global flows. */
export const SEED_ORIGINS: { iso2: string; name: string; lat: number; lng: number }[] = [
  { iso2: 'GB', name: 'United Kingdom', lat: 54.0, lng: -2.0 },
  { iso2: 'US', name: 'United States', lat: 39.8, lng: -98.6 },
  { iso2: 'DE', name: 'Germany', lat: 51.2, lng: 10.5 },
  { iso2: 'FR', name: 'France', lat: 46.2, lng: 2.2 },
  { iso2: 'IN', name: 'India', lat: 21.0, lng: 78.0 },
  { iso2: 'CN', name: 'China', lat: 35.9, lng: 104.2 },
  { iso2: 'SG', name: 'Singapore', lat: 1.35, lng: 103.8 },
  { iso2: 'AU', name: 'Australia', lat: -25.3, lng: 133.8 },
  { iso2: 'KR', name: 'South Korea', lat: 35.9, lng: 127.8 },
  { iso2: 'MY', name: 'Malaysia', lat: 4.2, lng: 101.9 },
  { iso2: 'CA', name: 'Canada', lat: 56.1, lng: -106.3 },
  { iso2: 'BR', name: 'Brazil', lat: -14.2, lng: -51.9 },
  { iso2: 'NL', name: 'Netherlands', lat: 52.1, lng: 5.3 },
  { iso2: 'TR', name: 'Türkiye', lat: 39.0, lng: 35.2 },
  { iso2: 'AE', name: 'United Arab Emirates', lat: 23.4, lng: 53.8 },
  { iso2: 'QA', name: 'Qatar', lat: 25.35, lng: 51.18 },
  { iso2: 'SA', name: 'Saudi Arabia', lat: 23.9, lng: 45.1 },
  { iso2: 'PH', name: 'Philippines', lat: 12.9, lng: 121.8 },
  { iso2: 'TW', name: 'Taiwan', lat: 23.7, lng: 121.0 },
  { iso2: 'HK', name: 'Hong Kong', lat: 22.4, lng: 114.1 },
  { iso2: 'NZ', name: 'New Zealand', lat: -40.9, lng: 174.9 },
  { iso2: 'ZA', name: 'South Africa', lat: -30.6, lng: 22.9 },
  { iso2: 'EG', name: 'Egypt', lat: 26.8, lng: 30.8 },
  { iso2: 'AR', name: 'Argentina', lat: -38.4, lng: -63.6 },
  { iso2: 'CL', name: 'Chile', lat: -35.7, lng: -71.5 },
  { iso2: 'CO', name: 'Colombia', lat: 4.6, lng: -74.3 },
  { iso2: 'PL', name: 'Poland', lat: 51.9, lng: 19.1 },
  { iso2: 'SE', name: 'Sweden', lat: 60.1, lng: 18.6 },
  { iso2: 'NO', name: 'Norway', lat: 60.5, lng: 8.5 },
  { iso2: 'DK', name: 'Denmark', lat: 56.3, lng: 9.5 },
  { iso2: 'FI', name: 'Finland', lat: 61.9, lng: 25.7 },
  { iso2: 'CH', name: 'Switzerland', lat: 46.8, lng: 8.2 },
  { iso2: 'AT', name: 'Austria', lat: 47.5, lng: 14.6 },
  { iso2: 'BE', name: 'Belgium', lat: 50.5, lng: 4.5 },
  { iso2: 'IE', name: 'Ireland', lat: 53.4, lng: -8.2 },
  { iso2: 'CZ', name: 'Czechia', lat: 49.8, lng: 15.5 },
  { iso2: 'IL', name: 'Israel', lat: 31.0, lng: 34.9 },
  { iso2: 'RU', name: 'Russia', lat: 61.5, lng: 105.3 },
  { iso2: 'NG', name: 'Nigeria', lat: 9.1, lng: 8.7 },
  { iso2: 'KE', name: 'Kenya', lat: -0.02, lng: 37.9 },
];
