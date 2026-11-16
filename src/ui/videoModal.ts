import type { Repair } from '../data/repairs';
import { searchVideos, searchUrl, getApiKey, QuotaError, type Video } from '../api/youtube';
import { getState, vehicleLabel, hasVehicle } from './store';
import { h, clear } from './dom';
import { openSettings } from './settings';
import { icon } from './icons';

let modal: HTMLElement | null = null;

function buildQuery(r: Repair): string {
  const v = getState().vehicle;
  const car = hasVehicle(v) ? vehicleLabel(v) : 'car';
  return `${car} ${r.query}`;
}

export function openVideoModal(r: Repair): void {
  closeVideoModal();
  const query = buildQuery(r);
  const body = h('div', { class: 'modal-body' });
  modal = h(
    'div',
    { class: 'modal-backdrop', onClick: (e) => { if (e.target === modal) closeVideoModal(); } },
    h(
      'div',
      { class: 'modal video-modal', role: 'dialog', 'aria-modal': 'true' },
      h('header', { class: 'modal-head' },
        h('div', {}, h('h2', {}, r.title), h('p', { class: 'muted' }, query)),
        h('a', { class: 'ghost-btn', href: searchUrl(query), target: '_blank', rel: 'noopener' }, 'Open on YouTube', icon('external', 15)),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onClick: closeVideoModal }, icon('close'))),
      body,
    ),
  );
  document.getElementById('modal-root')!.append(modal);
  document.addEventListener('keydown', onKey);
  renderList(body, query);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeVideoModal();
}

export function closeVideoModal(): void {
  modal?.remove();
  modal = null;
  document.removeEventListener('keydown', onKey);
}

async function renderList(body: HTMLElement, query: string): Promise<void> {
  clear(body);
  if (!getApiKey()) {
    body.append(noKeyNotice(query));
    return;
  }
  body.append(h('p', { class: 'muted loading' }, 'Searching YouTube…'));
  let videos: Video[];
  try {
    videos = await searchVideos(query);
  } catch (err) {
    clear(body);
    if (err instanceof QuotaError) {
      body.append(h('div', { class: 'notice' }, h('p', {}, 'The free YouTube quota for today is used up (it resets at midnight Pacific).'), h('a', { class: 'primary-btn', href: searchUrl(query), target: '_blank', rel: 'noopener' }, 'Search on YouTube instead', icon('external', 15))));
    } else {
      body.append(h('div', { class: 'notice' }, h('p', {}, 'Could not reach YouTube. Check the API key in settings.'), h('a', { class: 'primary-btn', href: searchUrl(query), target: '_blank', rel: 'noopener' }, 'Search on YouTube instead', icon('external', 15))));
    }
    return;
  }
  clear(body);
  if (!videos.length) {
    body.append(h('p', { class: 'muted' }, 'No videos found for that exact search.'));
    return;
  }
  const grid = h('div', { class: 'video-grid' });
  for (const v of videos) {
    grid.append(
      h('button', { class: 'video-card', onClick: () => renderPlayer(body, v, query) },
        h('img', { src: v.thumb, alt: '', loading: 'lazy' }),
        h('span', { class: 'video-title' }, v.title),
        h('span', { class: 'video-channel' }, v.channel)),
    );
  }
  body.append(grid);
}

function renderPlayer(body: HTMLElement, v: Video, query: string): void {
  clear(body);
  const src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
  body.append(
    h('button', { class: 'ghost-btn back', onClick: () => renderList(body, query) }, icon('arrow-left', 16), 'All videos'),
    h('div', { class: 'player' }, h('iframe', { src, title: v.title, allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture', allowfullscreen: true })),
    h('p', { class: 'video-title' }, v.title),
    h('p', { class: 'muted' }, v.channel),
  );
}

function noKeyNotice(query: string): HTMLElement {
  return h(
    'div',
    { class: 'notice' },
    h('p', {}, 'Videos open on YouTube in a new tab. To browse and play them right here, add a free YouTube API key in settings (takes two minutes).'),
    h('div', { class: 'row' },
      h('a', { class: 'primary-btn', href: searchUrl(query), target: '_blank', rel: 'noopener' }, 'Search on YouTube', icon('external', 15)),
      h('button', { class: 'ghost-btn', onClick: () => { closeVideoModal(); openSettings(); } }, 'Add API key')),
  );
}
