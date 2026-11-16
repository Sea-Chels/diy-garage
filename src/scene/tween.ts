/** Minimal tween runner. Call `updateTweens(now)` once per frame. */
export type Ease = (t: number) => number;
export const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack: Ease = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
export const easeOutQuint: Ease = (t) => 1 - Math.pow(1 - t, 5);

interface Tween {
  start: number;
  duration: number;
  ease: Ease;
  update: (k: number) => void;
  done?: () => void;
  tag?: string;
}

const active: Tween[] = [];

export function tween(opts: { duration: number; ease?: Ease; update: (k: number) => void; done?: () => void; tag?: string }): void {
  if (opts.tag) cancelTweens(opts.tag);
  active.push({ start: performance.now(), duration: opts.duration, ease: opts.ease ?? easeInOutCubic, update: opts.update, done: opts.done, tag: opts.tag });
}

export function cancelTweens(tag: string): void {
  for (let i = active.length - 1; i >= 0; i--) if (active[i].tag === tag) active.splice(i, 1);
}

export function updateTweens(now: number): void {
  for (let i = active.length - 1; i >= 0; i--) {
    const t = active[i];
    const k = Math.min(1, (now - t.start) / t.duration);
    t.update(t.ease(k));
    if (k >= 1) {
      active.splice(i, 1);
      t.done?.();
    }
  }
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
