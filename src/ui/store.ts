import type { PartId } from '../data/parts';
import type { Powertrain } from '../data/repairs';
import type { BodyChoice, Finish } from '../data/paint';

export interface Vehicle {
  year: number | null;
  make: string;
  model: string;
  powertrain: Powertrain;
}

export interface Appearance {
  color: string;
  finish: Finish;
  body: BodyChoice;
}

export interface State {
  vehicle: Vehicle;
  appearance: Appearance;
  selectedPart: PartId | null;
  /** Repair expanded in the side panel. */
  openRepair: string | null;
}

type Listener = (s: State, prev: State) => void;
const listeners = new Set<Listener>();
const STORAGE = 'diy-garage:vehicle';
const APPEARANCE_STORAGE = 'diy-garage:appearance';
const DEFAULT_APPEARANCE: Appearance = { color: '#d7263d', finish: 'gloss', body: 'auto' };

function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE);
    if (raw) return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_APPEARANCE };
}

function loadVehicle(): Vehicle {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return { year: null, make: '', model: '', powertrain: 'gas', ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { year: null, make: '', model: '', powertrain: 'gas' };
}

let state: State = { vehicle: loadVehicle(), appearance: loadAppearance(), selectedPart: null, openRepair: null };

export const getState = () => state;

export function setState(patch: Partial<State>): void {
  const prev = state;
  state = { ...state, ...patch };
  if (patch.vehicle) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state.vehicle));
    } catch {
      /* ignore */
    }
  }
  if (patch.appearance) {
    try {
      localStorage.setItem(APPEARANCE_STORAGE, JSON.stringify(state.appearance));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l(state, prev));
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function vehicleLabel(v: Vehicle): string {
  return [v.year, v.make, v.model].filter(Boolean).join(' ');
}

export function hasVehicle(v: Vehicle): boolean {
  return Boolean(v.year && v.make && v.model);
}
