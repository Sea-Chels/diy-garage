import { guessBody } from '../data/makes';
import { FINISHES, SWATCHES, type BodyChoice, type Finish } from '../data/paint';
import { getState, setState, subscribe } from './store';
import { h } from './dom';
import { icon } from './icons';

/** Floating "Paint" menu: body style, colour and finish. Built once, then kept in sync. */
export function mountPaintShop(root: HTMLElement): void {
  const toggle = h('button', { class: 'paint-toggle', 'aria-expanded': 'false', 'aria-controls': 'paint-card' }, icon('palette', 16), h('span', {}, 'Paint'), h('span', { class: 'paint-dot' }));
  const card = h('div', { class: 'paint-card', id: 'paint-card', role: 'dialog', 'aria-label': 'Paint and body style' });

  const setAppearance = (patch: Partial<ReturnType<typeof getState>['appearance']>) => setState({ appearance: { ...getState().appearance, ...patch } });

  // Body
  const bodyBtns = new Map<BodyChoice, HTMLButtonElement>();
  const bodyRow = h('div', { class: 'seg' });
  for (const b of ['auto', 'sedan', 'suv'] as BodyChoice[]) {
    const btn = h('button', { onClick: () => setAppearance({ body: b }) });
    bodyBtns.set(b, btn);
    bodyRow.append(btn);
  }

  // Colour
  const swatchBtns: HTMLButtonElement[] = [];
  const swatches = h('div', { class: 'swatches' });
  for (const s of SWATCHES) {
    const btn = h('button', { class: 'swatch', title: s.name, 'aria-label': s.name, onClick: () => setAppearance({ color: s.hex }) });
    btn.style.setProperty('--c', s.hex);
    btn.dataset.hex = s.hex;
    swatchBtns.push(btn);
    swatches.append(btn);
  }
  const custom = h('input', { type: 'color', 'aria-label': 'Custom colour' });
  custom.addEventListener('input', () => setAppearance({ color: custom.value }));
  const customWrap = h('label', { class: 'swatch custom', title: 'Custom colour' }, custom);
  swatches.append(customWrap);

  // Finish
  const finishBtns = new Map<Finish, HTMLButtonElement>();
  const finishRow = h('div', { class: 'seg' });
  for (const f of Object.keys(FINISHES) as Finish[]) {
    const btn = h('button', { onClick: () => setAppearance({ finish: f }) }, FINISHES[f].label);
    finishBtns.set(f, btn);
    finishRow.append(btn);
  }

  card.append(
    h('p', { class: 'paint-label' }, 'Body'), bodyRow,
    h('p', { class: 'paint-label' }, 'Color'), swatches,
    h('p', { class: 'paint-label' }, 'Finish'), finishRow,
  );
  root.append(toggle, card);

  function sync(): void {
    const { appearance: a, vehicle: v } = getState();
    const guess = guessBody(v.make, v.model);
    bodyBtns.forEach((btn, b) => {
      btn.textContent = b === 'auto' ? `Auto · ${guess === 'suv' ? 'SUV' : 'Sedan'}` : b === 'suv' ? 'SUV' : 'Sedan';
      btn.classList.toggle('active', a.body === b);
    });
    let matched = false;
    for (const btn of swatchBtns) {
      const on = btn.dataset.hex!.toLowerCase() === a.color.toLowerCase();
      matched ||= on;
      btn.classList.toggle('active', on);
    }
    customWrap.classList.toggle('active', !matched);
    customWrap.style.setProperty('--c', a.color);
    if (document.activeElement !== custom) custom.value = a.color;
    finishBtns.forEach((btn, f) => btn.classList.toggle('active', a.finish === f));
    toggle.style.setProperty('--c', a.color);
  }

  function setOpen(open: boolean): void {
    root.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }
  toggle.addEventListener('click', () => setOpen(!root.classList.contains('open')));
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  subscribe((s, prev) => {
    if (s.appearance !== prev.appearance || s.vehicle !== prev.vehicle) sync();
  });
  sync();
}
