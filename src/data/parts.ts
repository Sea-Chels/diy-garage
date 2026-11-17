/**
 * The clickable regions of the car. The 3D car module must provide a hotspot
 * for every PartId listed here; the UI and repair catalog key off these ids.
 */
export type PartId =
  | 'hood'
  | 'engine'
  | 'battery'
  | 'oil'
  | 'airbox'
  | 'coolant'
  | 'washer'
  | 'fusebox_engine'
  | 'wiper'
  | 'headlight'
  | 'taillight'
  | 'wheel'
  | 'brakes'
  | 'trunk'
  | 'door'
  | 'cabin'
  | 'fusebox_cabin'
  | 'fueldoor'
  | 'exhaust';

export interface PartInfo {
  id: PartId;
  label: string;
  blurb: string;
  /** Parts whose repairs are also shown when this one is selected. */
  related?: PartId[];
  /** Which lid must be opened to see this part. */
  behind?: 'hood' | 'trunk' | 'door';
  /** Visible (and clickable) through glass even while its lid is closed. */
  seeThrough?: boolean;
}

export const PARTS: Record<PartId, PartInfo> = {
  hood: { id: 'hood', label: 'Hood', blurb: 'Lift it to reach the engine bay. Most of the quick wins live under here.', related: ['engine', 'battery', 'oil', 'airbox', 'coolant', 'washer', 'fusebox_engine'] },
  engine: { id: 'engine', label: 'Engine', blurb: 'Spark plugs, belts and the odd sensor are reachable without pulling anything major.', behind: 'hood' },
  battery: { id: 'battery', label: '12V battery', blurb: 'Every car has one, EVs included. Terminals corrode, batteries die. Both are ten-minute jobs.', behind: 'hood' },
  oil: { id: 'oil', label: 'Oil cap & dipstick', blurb: 'The classic first DIY job. Check the level here, change it from underneath.', behind: 'hood' },
  airbox: { id: 'airbox', label: 'Air filter box', blurb: 'A clipped plastic box with a paper filter inside. Usually no tools at all.', behind: 'hood' },
  coolant: { id: 'coolant', label: 'Coolant reservoir', blurb: 'Translucent tank with MIN/MAX lines. Only ever open it cold.', behind: 'hood' },
  washer: { id: 'washer', label: 'Washer fluid', blurb: 'The tank with the windshield-and-spray symbol. Impossible to get wrong.', behind: 'hood' },
  fusebox_engine: { id: 'fusebox_engine', label: 'Engine fuse box', blurb: 'Black box with a lid near the battery. Holds the big fuses and relays.', behind: 'hood', related: ['fusebox_cabin'] },
  wiper: { id: 'wiper', label: 'Wipers', blurb: 'Blades wear every 6 to 12 months and clip on in seconds.' },
  headlight: { id: 'headlight', label: 'Headlights', blurb: 'Bulbs, turn signals and cloudy lenses. Reachable from the engine bay or wheel well.' },
  taillight: { id: 'taillight', label: 'Tail & brake lights', blurb: 'Usually reached from inside the trunk through a small access panel.' },
  wheel: { id: 'wheel', label: 'Wheels & tires', blurb: 'Pressure, rotations, plugs and the spare. Jack stands are not optional.', related: ['brakes'] },
  brakes: { id: 'brakes', label: 'Brakes', blurb: 'Pads are a solid intermediate job. Fluid level is a glance.' },
  trunk: { id: 'trunk', label: 'Trunk', blurb: 'Tail light access, spare tire, and struts that stop holding it up.', related: ['taillight'] },
  door: { id: 'door', label: 'Doors & mirrors', blurb: 'Mirror glass, weather strips and touch-up paint.', related: ['cabin', 'fusebox_cabin'] },
  cabin: { id: 'cabin', label: 'Cabin', blurb: 'Cabin filter, dome lights, key fob and the diagnostic port under the dash.', behind: 'door', seeThrough: true, related: ['fusebox_cabin'] },
  fusebox_cabin: { id: 'fusebox_cabin', label: 'Cabin fuse panel', blurb: 'Behind a small cover under or beside the dash. The diagram is on the lid.', behind: 'door' },
  fueldoor: { id: 'fueldoor', label: 'Fuel door', blurb: 'A loose or cracked gas cap is the most common check-engine light there is.' },
  exhaust: { id: 'exhaust', label: 'Exhaust', blurb: 'Oxygen sensors live here and are a frequent cause of check-engine codes.' },
};

export const PART_ORDER: PartId[] = [
  'hood', 'oil', 'airbox', 'battery', 'coolant', 'washer', 'fusebox_engine', 'engine',
  'wiper', 'headlight', 'taillight', 'wheel', 'brakes', 'trunk', 'door', 'cabin',
  'fusebox_cabin', 'fueldoor', 'exhaust',
];
