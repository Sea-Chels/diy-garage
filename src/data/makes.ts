/** Curated list of common makes. vPIC's full list has 10,000+ entries, mostly trailers. */
export const MAKES = [
  'Acura', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge', 'Fiat', 'Ford',
  'Genesis', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jaguar', 'Jeep', 'Kia', 'Land Rover', 'Lexus',
  'Lincoln', 'Lucid', 'Mazda', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Polestar', 'Porsche',
  'Ram', 'Rivian', 'Scion', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
];

const CURRENT_YEAR = new Date().getFullYear();
export const YEARS: number[] = [];
for (let y = CURRENT_YEAR + 1; y >= 1990; y--) YEARS.push(y);

const EV_MAKES = /^(tesla|rivian|lucid|polestar)$/i;
const EV_MODELS = /\b(leaf|bolt|ioniq 5|ioniq 6|ev6|ev9|mach-e|mustang mach|id\.?4|id\.? buzz|e-tron|q4|q8 e|eqs|eqb|eqe|i3|i4|i5|i7|ix|taycan|lyriq|ariya|solterra|bz4x|lightning|niro ev|kona electric|e-golf|spark ev|500e|cooper se|blazer ev|equinox ev|silverado ev|prologue|zdx|hummer ev|r1t|r1s|air|cybertruck|model [3sxy]|focus electric|fit ev|soul ev|clarity electric|mirai|nexo)\b/i;
const HYBRID_MODELS = /\b(prius|hybrid|hev|phev|plug-in|insight|cr-z|volt|clarity|niro|ioniq|rav4 prime|pacifica hybrid|e-power|energi|lexus (ct|es 300h|nx 300h|rx 450h|ux 250h))\b/i;
const DIESEL_MODELS = /\b(tdi|diesel|power stroke|duramax|cummins|bluetec|ecodiesel|d4d|crd|td)\b/i;

export function guessPowertrain(make: string, model: string): 'gas' | 'diesel' | 'hybrid' | 'ev' {
  if (EV_MAKES.test(make) || EV_MODELS.test(model)) return 'ev';
  if (HYBRID_MODELS.test(model)) return 'hybrid';
  if (DIESEL_MODELS.test(model)) return 'diesel';
  return 'gas';
}

const SUV_MAKES = /^(jeep|land rover|rivian)$/i;
const SUV_MODELS = new RegExp(
  '\\b(' +
    [
      'cr-?v', 'hr-?v', 'pilot', 'passport', 'ridgeline', 'odyssey', 'prologue',
      'rav4', 'highlander', '4runner', 'sequoia', 'land cruiser', 'venza', 'c-hr', 'corolla cross', 'bz4x', 'tacoma', 'tundra', 'sienna',
      'tahoe', 'suburban', 'equinox', 'traverse', 'blazer', 'trailblazer', 'trax', 'silverado', 'colorado',
      'yukon', 'acadia', 'terrain', 'sierra', 'canyon', 'hummer', 'savana',
      'explorer', 'expedition', 'escape', 'edge', 'bronco', 'ranger', 'maverick', 'f-?\\d{3}', 'transit', 'mach-e', 'mustang mach',
      'grand cherokee', 'cherokee', 'compass', 'renegade', 'wrangler', 'gladiator', 'wagoneer',
      'durango', 'journey', 'pacifica', 'ram', 'promaster',
      'tucson', 'santa fe', 'palisade', 'kona', 'venue', 'santa cruz', 'ioniq 5', 'ioniq 9',
      'sportage', 'sorento', 'telluride', 'seltos', 'soul', 'niro', 'carnival', 'ev9',
      'rogue', 'murano', 'pathfinder', 'armada', 'kicks', 'frontier', 'titan', 'ariya', 'juke', 'xterra',
      'forester', 'outback', 'ascent', 'crosstrek', 'solterra',
      'tiguan', 'atlas', 'taos', 'id\\.?\\s?4', 'touareg',
      'cx-\\d+', 'mx-30', 'outlander', 'eclipse cross',
      'model [xy]', 'cybertruck',
      'mdx', 'rdx', 'zdx', 'qx\\d+', 'gv\\d+', 'xc\\d+', 'ex\\d+',
      'rx', 'nx', 'gx', 'lx', 'ux', 'tx', 'rz',
      'q[2-8]', 'e-tron', 'x[1-7]', 'ix', 'gl[abcse]', 'g-class', 'eq[bes] suv',
      'escalade', 'xt[456]', 'lyriq', 'navigator', 'aviator', 'nautilus', 'corsair',
      'cayenne', 'macan', 'countryman', 'stelvio', 'levante', 'urus', 'bentayga', 'cullinan', 'dbx',
    ].join('|') +
    ')\\b',
  'i',
);

/** Rough body style from make and model; good enough to pick a generic 3D body. */
export function guessBody(make: string, model: string): 'sedan' | 'suv' {
  if (SUV_MAKES.test(make.trim())) return 'suv';
  return SUV_MODELS.test(model) ? 'suv' : 'sedan';
}
