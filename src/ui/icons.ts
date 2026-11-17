/**
 * Lucide icons (https://lucide.dev), imported individually so only the used
 * ones end up in the bundle.
 */
import { createElement, BookOpen, Palette, ExternalLink, PiggyBank, Play, TriangleAlert, Wrench, X, type IconNode } from 'lucide';

const ICONS = {
  book: BookOpen,
  palette: Palette,
  external: ExternalLink,
  savings: PiggyBank,
  play: Play,
  warning: TriangleAlert,
  wrench: Wrench,
  close: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 18): SVGElement {
  const el = createElement(ICONS[name]);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('icon');
  return el;
}

/** Fill every `<i data-icon="name">` placeholder in static HTML. */
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('i[data-icon]').forEach((el) => {
    const name = el.dataset.icon as IconName;
    if (!(name in ICONS)) return;
    el.replaceWith(icon(name, Number(el.dataset.size) || 18));
  });
}
