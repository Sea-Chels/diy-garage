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
