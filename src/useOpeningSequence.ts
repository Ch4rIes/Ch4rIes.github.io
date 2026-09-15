import { useLayoutEffect, useRef, type RefObject } from 'react';

export const OPENING_DURATION = 1600;
export type OpeningSequence = { startedAt: number | null };

export function openingProgress(sequence: OpeningSequence, now: number) {
  return sequence.startedAt === null ? 1
    : Math.max(0, Math.min(1, (now - sequence.startedAt) / OPENING_DURATION));
}

export function useOpeningSequence(root: RefObject<HTMLElement | null>) {
  const sequence = useRef<OpeningSequence>({ startedAt: null });

  useLayoutEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const isDeepLink = location.hash !== '' && location.hash !== '#main';
    // Content is visible by default. Only a fresh visit to the top gets an
    // entrance; restored reading positions and reduced motion skip it.
    if (preference.matches || isDeepLink || window.scrollY > 24 || navigation?.type === 'back_forward') return;

    sequence.current.startedAt = performance.now();
    const animations: Animation[] = [];
    const reveal = (selector: string, delay: number, duration: number, distance: number, anchor = '') => {
      const element = root.current?.querySelector<HTMLElement>(selector);
      if (!element?.animate) return;
      const animation = element.animate([
        { opacity: 0, transform: `${anchor} translateY(${distance}px)` },
        { opacity: 1, transform: `${anchor} translateY(0)` },
      ], { duration, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      animation.id = `opening-${selector.replace(/[^a-z]/g, '')}`;
      animation.startTime = sequence.current.startedAt;
      animations.push(animation);
    };
    reveal('.hero h1', 340, 850, 8);
    reveal('.hero .intro', 560, 800, 6);
    reveal('.scroll-note', 1050, 550, 4, 'translateX(-50%)');

    let hiddenAt: number | null = document.hidden ? performance.now() : null;
    if (hiddenAt !== null) animations.forEach(animation => animation.pause());
    const visibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        animations.forEach(animation => { if (animation.playState === 'running') animation.pause(); });
      } else if (hiddenAt !== null) {
        if (sequence.current.startedAt !== null) sequence.current.startedAt += performance.now() - hiddenAt;
        hiddenAt = null;
        animations.forEach(animation => { if (animation.playState === 'paused') animation.play(); });
      }
    };
    const finish = () => {
      if (!preference.matches) return;
      sequence.current.startedAt = null;
      animations.forEach(animation => animation.cancel());
    };
    preference.addEventListener('change', finish);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      sequence.current.startedAt = null;
      animations.forEach(animation => animation.cancel());
      preference.removeEventListener('change', finish);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [root]);

  return sequence;
}
