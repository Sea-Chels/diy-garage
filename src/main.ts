import './style.css';
import { createScene } from './scene/scene';
import { PARTS, type PartId } from './data/parts';
import { REPAIRS, REPAIR_BY_ID, appliesTo } from './data/repairs';
import { getState, setState, subscribe } from './ui/store';
import { mountVehiclePicker } from './ui/vehiclePicker';
import { mountPanel } from './ui/panel';
import { openGlossary } from './ui/glossary';
import { h, clear } from './ui/dom';
import { hydrateIcons } from './ui/icons';

hydrateIcons();

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const scene = createScene(canvas);

mountVehiclePicker(document.getElementById('vehicle-picker')!);
mountPanel(document.getElementById('panel')!);
document.getElementById('glossary-btn')!.addEventListener('click', openGlossary);

// 3D → state
scene.onSelect((part) => {
  const cur = getState();
  if (part === cur.selectedPart) return;
  setState({ selectedPart: part, openRepair: null });
});

const hint = document.getElementById('hint')!;
scene.onHover((part) => {
  hint.textContent = part ? PARTS[part].label : 'Drag to look around. Click a glowing dot.';
  hint.classList.toggle('active', Boolean(part));
});

// state → 3D + URL hash
subscribe((s, prev) => {
  if (s.selectedPart !== prev.selectedPart) scene.focus(s.selectedPart);
  if (s.selectedPart !== prev.selectedPart || s.openRepair !== prev.openRepair) {
    const hash = s.openRepair ? `#${s.openRepair}` : s.selectedPart ? `#${s.selectedPart}` : '';
    history.replaceState(null, '', hash || location.pathname + location.search);
  }
  if (s.vehicle.powertrain !== prev.vehicle.powertrain) renderQuickFixes();
});

// Quick-fix bar: featured repairs for the current powertrain.
const quick = document.getElementById('quick-fixes')!;
function renderQuickFixes(): void {
  clear(quick);
  const pt = getState().vehicle.powertrain;
  for (const r of REPAIRS) {
    if (!r.featured || !appliesTo(r, pt)) continue;
    quick.append(h('button', { class: 'quick-chip', onClick: () => setState({ selectedPart: r.parts[0], openRepair: r.id }) }, r.title));
  }
  quick.append(h('button', { class: 'quick-chip more', onClick: openGlossary }, 'All fixes…'));
}
renderQuickFixes();

// Deep link: #oil-change or #battery
function applyHash(): void {
  const id = location.hash.slice(1);
  if (!id) return setState({ selectedPart: null, openRepair: null });
  const repair = REPAIR_BY_ID.get(id);
  if (repair) setState({ selectedPart: repair.parts[0], openRepair: repair.id });
  else if (id in PARTS) setState({ selectedPart: id as PartId, openRepair: null });
}
window.addEventListener('hashchange', applyHash);
if (location.hash) applyHash();
