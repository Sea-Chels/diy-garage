import { PARTS } from '../data/parts';
import { DIFFICULTY_LABEL, repairsForPart, type Repair } from '../data/repairs';
import { getState, setState, subscribe, vehicleLabel, hasVehicle } from './store';
import { h, clear, fmtMinutes } from './dom';
import { openVideoModal } from './videoModal';
import { icon } from './icons';

export function mountPanel(root: HTMLElement): void {
  function render(): void {
    const { selectedPart, openRepair, vehicle } = getState();
    clear(root);
    root.classList.toggle('open', Boolean(selectedPart));
    if (!selectedPart) return;

    const info = PARTS[selectedPart];
    const primary = repairsForPart(selectedPart, vehicle.powertrain);
    const seen = new Set(primary.map((r) => r.id));
    const nearby: Repair[] = [];
    for (const rel of info.related ?? []) {
      for (const r of repairsForPart(rel, vehicle.powertrain)) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          nearby.push(r);
        }
      }
    }

    root.append(
      h(
        'header',
        { class: 'panel-head' },
        h('div', {},
          h('h2', {}, info.label),
          h('p', { class: 'muted' }, info.blurb)),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: () => setState({ selectedPart: null, openRepair: null }) }, icon('close')),
      ),
    );

    const list = h('div', { class: 'repair-list' });
    if (primary.length === 0 && nearby.length === 0) {
      list.append(h('p', { class: 'muted' }, `Nothing here is a sensible DIY job on a ${vehicle.powertrain === 'ev' ? 'electric car' : 'car like this'}. Leave it to a shop.`));
    }
    for (const r of primary) list.append(repairCard(r, r.id === openRepair, vehicle.powertrain));
    if (nearby.length) {
      list.append(h('h3', { class: 'section-label' }, 'Nearby'));
      for (const r of nearby) list.append(repairCard(r, r.id === openRepair, vehicle.powertrain));
    }
    root.append(list);

    if (openRepair) {
      requestAnimationFrame(() => {
        const card = root.querySelector<HTMLElement>('.repair-card.open');
        if (card) root.scrollTo({ top: Math.max(0, card.offsetTop - 120), behavior: 'smooth' });
      });
    }
  }

  function repairCard(r: Repair, open: boolean, _pt: string): HTMLElement {
    const vehicle = getState().vehicle;
    const card = h('article', { class: `repair-card diff-${r.difficulty}${open ? ' open' : ''}` });
    card.append(
      h(
        'button',
        { class: 'repair-head', 'aria-expanded': String(open), onClick: () => setState({ openRepair: open ? null : r.id }) },
        h('span', { class: 'repair-title' }, r.title),
        h('span', { class: 'chips' },
          h('span', { class: `chip diff` }, DIFFICULTY_LABEL[r.difficulty]),
          h('span', { class: 'chip' }, fmtMinutes(r.minutes))),
      ),
    );
    if (!open) return card;

    const body = h('div', { class: 'repair-body' });
    body.append(h('p', { class: 'summary' }, r.summary));
    body.append(h('p', { class: 'savings' }, icon('savings', 16), h('span', {}, r.savings)));

    const videoBtn = h(
      'button',
      { class: 'primary-btn', onClick: () => openVideoModal(r) },
      icon('play', 16),
      hasVehicle(vehicle) ? `Videos for your ${vehicleLabel(vehicle)}` : 'Watch how-to videos',
    );
    body.append(videoBtn);
    if (!hasVehicle(vehicle)) body.append(h('p', { class: 'hint-text' }, 'Pick your year, make and model above to get videos for your exact car.'));

    if (r.cautions?.length) {
      body.append(h('div', { class: 'cautions' }, ...r.cautions.map((c) => h('p', {}, icon('warning', 16), h('span', {}, c)))));
    }
    body.append(
      h('div', { class: 'two-col' },
        h('div', {}, h('h4', {}, 'Tools'), h('ul', {}, ...r.tools.map((t) => h('li', {}, t)))),
        h('div', {}, h('h4', {}, 'Parts & supplies'), h('ul', {}, ...(r.supplies.length ? r.supplies.map((t) => h('li', {}, t)) : [h('li', { class: 'muted' }, 'Nothing to buy')])))),
    );
    body.append(h('h4', {}, 'Steps'), h('ol', { class: 'steps' }, ...r.steps.map((s) => h('li', {}, s))));
    card.append(body);
    return card;
  }

  subscribe((s, prev) => {
    if (s.selectedPart !== prev.selectedPart || s.openRepair !== prev.openRepair || s.vehicle !== prev.vehicle) render();
  });
  render();
}
