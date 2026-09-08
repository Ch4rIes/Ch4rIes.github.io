import { useEffect, useRef, useState } from 'react';

// Small independent paths gather into a coherent current: order from complexity.
const TAU = Math.PI * 2;
let seed = 83;
const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
const particles = Array.from({ length: 5800 }, () => ({
  u: random(), strand: Math.floor(random() * 3),
  offset: (random() + random() + random() - 1.5) / 1.5,
  depth: random(), size: .55 + random() * 1.1, phase: random() * TAU,
}));

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ time: 0, scroll: 0, velocity: 0 });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = innerWidth, height = innerHeight, frame = 0, last = 0;
    let previousScroll = window.scrollY;
    const draw = (now: number) => {
      const still = paused || reduced.matches;
      if (!still && now - last < 25) { frame = requestAnimationFrame(draw); return; }
      const dt = Math.min((now - last) / 1000, .05);
      last = now;
      const current = state.current;
      if (!still) {
        const target = window.scrollY;
        const velocity = Math.max(-2, Math.min(2, (target - previousScroll) / Math.max(height * dt, 1)));
        current.velocity += (velocity - current.velocity) * (1 - Math.exp(-dt * 5));
        current.scroll += (target / height - current.scroll) * (1 - Math.exp(-dt * 7));
        current.time += dt * (.6 + Math.abs(current.velocity) * .55);
        previousScroll = target;
      }
      const time = reduced.matches ? 0 : current.time;
      const scroll = reduced.matches ? 0 : current.scroll;
      const velocity = reduced.matches ? 0 : current.velocity;
      const scene = Math.min(1, scroll / .8);
      const count = width < 640 ? 3200 : particles.length;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < count; i++) {
        const point = particles[i];
        const u = ((point.u + time * .022 + scroll * .055) % 1 + 1) % 1;
        // Each layer follows the same broad curve, separating and rejoining slowly.
        const wave = u * TAU * .83 + scroll * .43 - .9;
        const spine = .79 - u * .13 + Math.sin(wave) * .19;
        const fold = Math.sin(u * TAU * 1.05 + point.strand * .7 + time * .065 + scroll * .32);
        const spread = .022 + .10 * Math.pow(Math.sin(u * Math.PI + .35), 2);
        const lane = (point.strand - 1) * .037 * Math.cos(wave + time * .06);
        const x = width * (u * 1.35 - .175);
        const y = height * (spine + lane + point.offset * spread + fold * .07 * point.depth
          - scene * .12 + velocity * .025 * Math.sin(u * Math.PI));
        const edge = Math.min(1, u * 10, (1 - u) * 10);
        // Reserve a calm pocket for the introduction and soften behind the reading column.
        const heroQuiet = Math.exp(-Math.pow((x / width - .5) / .34, 4) - Math.pow((y / height - .43) / .20, 4));
        const readingQuiet = Math.exp(-Math.pow((x / width - .5) / .38, 8));
        const quiet = heroQuiet * (1 - scene) + readingQuiet * scene;
        const alpha = (.24 + point.depth * .27) * edge * (1 - quiet * .76);
        const size = point.size * (width < 640 ? .85 : 1) * (.75 + point.depth * .45);
        ctx.fillStyle = `rgba(${point.strand === 0 ? '61,86,91' : point.strand === 1 ? '82,111,122' : '127,117,94'},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, TAU);
        ctx.fill();
      }
      if (!still && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      previousScroll = window.scrollY;
      last = performance.now() - 26;
      if (!document.hidden) draw(performance.now());
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width; height = Math.max(1, bounds.height);
      const dpr = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      restart();
    };
    resize();
    const sizing = new ResizeObserver(resize);
    sizing.observe(canvas);
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    return () => {
      cancelAnimationFrame(frame);
      sizing.disconnect();
      document.removeEventListener('visibilitychange', restart);
      reduced.removeEventListener('change', restart);
    };
  }, [paused]);

  return <>
    <canvas className="particle-background" ref={canvasRef} aria-hidden="true" />
    <button className="motion-control" aria-label={paused ? 'Play background flow' : 'Pause background flow'} title={paused ? 'Play background flow' : 'Pause background flow'} onClick={() => setPaused(value => !value)} aria-pressed={paused}>
      <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
    </button>
  </>;
}
