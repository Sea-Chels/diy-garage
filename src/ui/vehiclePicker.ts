import { MAKES, YEARS, guessPowertrain } from '../data/makes';
import { modelsForMakeYear } from '../api/vpic';
import type { Powertrain } from '../data/repairs';
import { getState, setState } from './store';
import { h, clear } from './dom';

const POWERTRAINS: { id: Powertrain; label: string }[] = [
  { id: 'gas', label: 'Gas' },
  { id: 'diesel', label: 'Diesel' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'ev', label: 'Electric' },
];

export function mountVehiclePicker(root: HTMLElement): void {
  const v = getState().vehicle;

  const yearSel = h('select', { 'aria-label': 'Year', autocomplete: 'off' }, h('option', { value: '' }, 'Year'), ...YEARS.map((y) => h('option', { value: String(y), selected: v.year === y }, String(y))));
  const makeSel = h('select', { 'aria-label': 'Make', autocomplete: 'off' }, h('option', { value: '' }, 'Make'), ...MAKES.map((m) => h('option', { value: m, selected: v.make === m }, m)));
  const modelWrap = h('span', { class: 'model-wrap' });
  const ptSel = h('select', { 'aria-label': 'Powertrain', class: 'pt', autocomplete: 'off' }, ...POWERTRAINS.map((p) => h('option', { value: p.id, selected: v.powertrain === p.id }, p.label)));

  function commit(patch: Partial<typeof v>): void {
    setState({ vehicle: { ...getState().vehicle, ...patch } });
  }

  async function loadModels(): Promise<void> {
    const year = Number(yearSel.value) || null;
    const make = makeSel.value;
    clear(modelWrap);
    if (!year || !make) {
      modelWrap.append(h('select', { disabled: true, 'aria-label': 'Model' }, h('option', {}, 'Model')));
      return;
    }
    modelWrap.append(h('select', { disabled: true, 'aria-label': 'Model' }, h('option', {}, 'Loading…')));
    let models: string[] = [];
    try {
      models = await modelsForMakeYear(make, year);
    } catch {
      /* fall through to free text */
    }
    // The user may have changed the selects while we were fetching.
    if (Number(yearSel.value) !== year || makeSel.value !== make) return;
    clear(modelWrap);
    const current = getState().vehicle;
    if (models.length) {
      const sel = h('select', { 'aria-label': 'Model', autocomplete: 'off' }, h('option', { value: '' }, 'Model'), ...models.map((m) => h('option', { value: m, selected: current.make === make && current.year === year && current.model === m }, m)));
      sel.addEventListener('change', () => {
        const model = sel.value;
        const powertrain = guessPowertrain(make, model);
        ptSel.value = powertrain;
        commit({ year, make, model, powertrain });
      });
      modelWrap.append(sel);
    } else {
      const input = h('input', { type: 'text', placeholder: 'Model (type it)', 'aria-label': 'Model', value: current.model });
      input.addEventListener('change', () => {
        const model = input.value.trim();
        const powertrain = guessPowertrain(make, model);
        ptSel.value = powertrain;
        commit({ year, make, model, powertrain });
      });
      modelWrap.append(input);
    }
  }

  yearSel.addEventListener('change', () => {
    commit({ year: Number(yearSel.value) || null, model: '' });
    loadModels();
  });
  makeSel.addEventListener('change', () => {
    commit({ make: makeSel.value, model: '' });
    loadModels();
  });
  ptSel.addEventListener('change', () => commit({ powertrain: ptSel.value as Powertrain }));

  root.append(h('span', { class: 'picker-label' }, 'My car'), yearSel, makeSel, modelWrap, ptSel);
  loadModels();
}
