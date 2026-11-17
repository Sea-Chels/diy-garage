export type Finish = 'matte' | 'satin' | 'gloss' | 'metallic';
export type BodyChoice = 'auto' | 'sedan' | 'suv';

export const FINISHES: Record<Finish, { label: string; shine: number; metal: number }> = {
  matte: { label: 'Matte', shine: 0, metal: 0 },
  satin: { label: 'Satin', shine: 0.35, metal: 0.12 },
  gloss: { label: 'Gloss', shine: 0.85, metal: 0.3 },
  metallic: { label: 'Metallic', shine: 0.7, metal: 0.85 },
};

export const SWATCHES: { name: string; hex: string }[] = [
  { name: 'Spider red', hex: '#d7263d' },
  { name: 'Sunset orange', hex: '#f26a3d' },
  { name: 'Taxi yellow', hex: '#ffc531' },
  { name: 'Acid lime', hex: '#9be22d' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Electric blue', hex: '#2f5bea' },
  { name: 'Midnight', hex: '#1f2a5c' },
  { name: 'Ultraviolet', hex: '#7b3fe4' },
  { name: 'Hot pink', hex: '#ff4fa3' },
  { name: 'Pearl', hex: '#eceef2' },
  { name: 'Silver', hex: '#a9b0bc' },
  { name: 'Graphite', hex: '#3a3d46' },
];
