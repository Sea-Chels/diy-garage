import { PARTS, PART_ORDER, type PartId } from '../data/parts';
import { REPAIRS, DIFFICULTY_LABEL, appliesTo, type Difficulty, type Repair } from '../data/repairs';
import { getState, setState } from './store';
import { h, clear, fmtMinutes } from './dom';
import { icon } from './icons';

let modal: HTMLElement | null = null;

export function openGlossary(): void {
  closeGlossary();
  let query = '';
  let difficulty: Difficulty | 0 = 0;
  let showAll = false;

  const input = h('input', { type: 'search', placeholder: 'Search fixes: oil, fuse, brake light, P0455…', 'aria-label': 'Search fixes', autocomplete: 'off' });
  const results = h('div', { class: 'glossary-results' });
  const chips = h('div', { class: 'filter-row' });

  function renderChips(): void {
    clear(chips);
    const mk = (label: string, active: boolean, onClick: () => void) => h('button', { class: `chip-btn${active ? ' active' : ''}`, onClick }, label);
    chips.append(
      mk('All levels', difficulty === 0, () => { difficulty = 0; renderAll(); }),
      ...([1, 2, 3] as Difficulty[]).map((d) => mk(DIFFICULTY_LABEL[d], difficulty === d, () => { difficulty = d; renderAll(); })),
      h('span', { class: 'spacer' }),
      mk(showAll ? 'All powertrains' : `${getState().vehicle.powertrain.toUpperCase()} only`, !showAll, () => { showAll = !showAll; renderAll(); }),
    );
  }

  function matches(r: Repair, q: string): boolean {
    if (!q) return true;
    const hay = [r.title, ...r.aliases, ...r.parts.map((p) => PARTS[p].label), r.summary].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  }

  function renderResults(): void {
    clear(results);
    const pt = getState().vehicle.powertrain;
    const q = query.trim().toLowerCase();
    const byPart = new Map<PartId, Repair[]>();
    let count = 0;
    for (const r of REPAIRS) {
      if (!showAll && !appliesTo(r, pt)) continue;
      if (difficulty && r.difficulty !== difficulty) continue;
      if (!matches(r, q)) continue;
      const p = r.parts[0];
      byPart.set(p, [...(byPart.get(p) ?? []), r]);
      count++;
    }
    if (!count) {
      results.append(h('p', { class: 'muted' }, 'No fixes match. Try a broader word, or switch on all powertrains.'));
      return;
    }
    for (const part of PART_ORDER) {
      const list = byPart.get(part);
      if (!list) continue;
      results.append(h('h3', { class: 'section-label' }, PARTS[part].label));
      for (const r of list) {
        results.append(
          h('button', { class: `glossary-item diff-${r.difficulty}`, onClick: () => { closeGlossary(); setState({ selectedPart: r.parts[0], openRepair: r.id }); } },
            h('span', { class: 'repair-title' }, r.title),
            h('span', { class: 'chips' }, h('span', { class: 'chip diff' }, DIFFICULTY_LABEL[r.difficulty]), h('span', { class: 'chip' }, fmtMinutes(r.minutes))),
            h('span', { class: 'muted small' }, r.summary)),
        );
      }
    }
  }

  function renderAll(): void {
    renderChips();
    renderResults();
  }

  input.addEventListener('input', () => { query = input.value; renderResults(); });

  modal = h(
    'div',
    { class: 'modal-backdrop', onClick: (e) => { if (e.target === modal) closeGlossary(); } },
    h(
      'div',
      { class: 'modal glossary-modal', role: 'dialog', 'aria-modal': 'true' },
      h('header', { class: 'modal-head' }, h('div', {}, h('h2', {}, 'Everything you can fix'), h('p', { class: 'muted' }, `${REPAIRS.length} jobs, all doable in a driveway.`)), h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: closeGlossary }, icon('close'))),
      h('div', { class: 'modal-body' }, input, chips, results),
    ),
  );
  document.getElementById('modal-root')!.append(modal);
  document.addEventListener('keydown', onKey);
  renderAll();
  input.focus();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeGlossary();
}

export function closeGlossary(): void {
  modal?.remove();
  modal = null;
  document.removeEventListener('keydown', onKey);
}
