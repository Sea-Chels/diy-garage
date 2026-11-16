import { getApiKey, setApiKey } from '../api/youtube';
import { h } from './dom';
import { icon } from './icons';

let modal: HTMLElement | null = null;

export function openSettings(): void {
  closeSettings();
  const input = h('input', { type: 'password', value: getApiKey(), placeholder: 'AIza…', autocomplete: 'off', spellcheck: 'false' });
  modal = h(
    'div',
    { class: 'modal-backdrop', onClick: (e) => { if (e.target === modal) closeSettings(); } },
    h(
      'div',
      { class: 'modal settings-modal', role: 'dialog', 'aria-modal': 'true' },
      h('header', { class: 'modal-head' }, h('h2', {}, 'Settings'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: closeSettings }, icon('close'))),
      h('div', { class: 'modal-body' },
        h('label', { class: 'field' }, h('span', {}, 'YouTube Data API key (optional)'), input),
        h('p', { class: 'muted small' }, 'Stored only in this browser. Lets the app list and play videos in-page instead of linking out. The free quota is about 100 searches a day; results are cached for a week.'),
        h('ol', { class: 'small muted' },
          h('li', {}, 'Go to console.cloud.google.com, create a project.'),
          h('li', {}, 'Open APIs & Services, then Library, and enable "YouTube Data API v3".'),
          h('li', {}, 'Open Credentials and create an API key. Under "Application restrictions" choose HTTP referrers and add this site.'),
          h('li', {}, 'Paste it here.')),
        h('div', { class: 'row' },
          h('button', { class: 'primary-btn', onClick: () => { setApiKey(input.value.trim()); closeSettings(); } }, 'Save'),
          h('button', { class: 'ghost-btn', onClick: () => { setApiKey(''); input.value = ''; } }, 'Clear'))),
    ),
  );
  document.getElementById('modal-root')!.append(modal);
  document.addEventListener('keydown', onKey);
  input.focus();
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeSettings();
}

export function closeSettings(): void {
  modal?.remove();
  modal = null;
  document.removeEventListener('keydown', onKey);
}
