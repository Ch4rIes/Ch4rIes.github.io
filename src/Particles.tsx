import { useEffect, useRef, useState } from 'react';

const TAU = Math.PI * 2;
const hills = [
  { x: -1.7, z: .35, height: 1.2, spread: 1.1 },
  { x: 1.2, z: -.65, height: 1.65, spread: .95 },
  { x: 2.65, z: 1.5, height: .9, spread: .85 },
];
// An artistic reward surface; agents use noisy gradient ascent, not a trained RL policy.
function reward(x: number, z: number) {
  let value = .07 * Math.sin(x * 1.4) * Math.cos(z);
  for (const hill of hills) value += hill.height * Math.exp(-((x - hill.x) ** 2 + (z - hill.z) ** 2) / (2 * hill.spread ** 2));
  return value;
}
function gradient(x: number, z: number) {
  let dx = .098 * Math.cos(x * 1.4) * Math.cos(z);
  let dz = -.07 * Math.sin(x * 1.4) * Math.sin(z);
  for (const hill of hills) {
    const variance = hill.spread ** 2;
    const value = hill.height * Math.exp(-((x - hill.x) ** 2 + (z - hill.z) ** 2) / (2 * variance));
    dx -= value * (x - hill.x) / variance;
    dz -= value * (z - hill.z) / variance;
  }
  return { x: dx, z: dz };
}
function randomSource(initial: number) {
  let seed = initial;
  return () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
}
const random = randomSource(193);
type SurfacePoint = { x: number; z: number; height: number };
const terrain: Array<SurfacePoint & { size: number; intensity: number }> = [];
// Importance sampling makes slopes read through density, without a visible grid.
while (terrain.length < 11500) {
  const x = (random() - .5) * 9.2;
  const z = (random() - .5) * 5.6;
  const height = reward(x, z);
  const footprint = Math.exp(-Math.pow(x / 4.2, 8) - Math.pow((z + .15 * Math.sin(x)) / 2.25, 6));
  if (random() > footprint * (.20 + Math.min(.68, height * .39))) continue;
  const slope = gradient(x, z);
  terrain.push({ x, z, height, size: .40 + random() * .55,
    intensity: .22 + Math.min(.25, height * .12) + Math.min(.13, Math.max(0, slope.x * .13 - slope.z * .10)) });
}
// Continuous streams follow exploratory ascent paths. Their density increases as
// progress slows near a summit, and their ends fade before the next exploration.
const streams = Array.from({ length: 190 }, () => {
  let x = (random() - .5) * 7.8, z = (random() - .5) * 4.8;
  const phase = random() * TAU;
  const path: SurfacePoint[] = [];
  for (let step = 0; step < 100; step++) {
    path.push({ x, z, height: reward(x, z) });
    const slope = gradient(x, z);
    const norm = Math.max(.45, Math.hypot(slope.x, slope.z));
    x += slope.x / norm * .065 + Math.sin(step * .10 + phase) * .014;
    z += slope.z / norm * .065 + Math.cos(step * .08 + phase) * .014;
  }
  return { path, phase, speed: .025 + random() * .018 };
});

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef({ time: 0, scroll: 0, velocity: 0 });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = innerWidth, height = innerHeight, frame = 0, last = 0;
    let previousScroll = window.scrollY;
    const current = scene.current;
    const batches: number[][] = Array.from({ length: 14 }, () => []);
    const draw = (now: number) => {
      const still = paused || reduced.matches;
      if (!still && now - last < 25) { frame = requestAnimationFrame(draw); return; }
      const dt = Math.min((now - last) / 1000, .05);
      last = now;
      if (!still) {
        const target = Math.max(0, window.scrollY);
        const velocity = Math.max(-2, Math.min(2, (target - previousScroll) / Math.max(height * dt, 1)));
        current.velocity += (velocity - current.velocity) * (1 - Math.exp(-dt * 5));
        current.scroll += (target / height - current.scroll) * (1 - Math.exp(-dt * 6));
        current.time += dt * (1 + Math.abs(current.velocity) * .2);
        previousScroll = target;

      }
      const scroll = reduced.matches ? 0 : current.scroll;
      const time = reduced.matches ? 0 : current.time;
      const reading = Math.min(1, scroll / .8);
      const yaw = -.22 + Math.atan(scroll * .4) * .36 + Math.sin(time * .045) * .018;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const vertical = Math.min(height * .19, width * .27);
      const project = (x: number, z: number, elevation: number) => {
        // A long, slow wave carries both the surface and the uphill streams.
        const wave = Math.sin(x * .85 + z * .55 - time * .22 + scroll * .22);
        const driftX = x + .13 * Math.sin(z * .9 + time * .12 + scroll * .13);
        const driftZ = z + wave * .17;
        return {
          x: width * .5 + (driftX * cos - driftZ * sin) * width * .15,
          y: height * (.88 - reading * .08) + (driftZ * cos + driftX * sin) * vertical * .35
            - (elevation + wave * .12) * vertical,
        };
      };
      const opacity = (x: number, y: number) => {
        const title = Math.exp(-Math.pow((x / width - .5) / .34, 4) - Math.pow((y / height - .43) / .18, 4));
        const text = Math.exp(-Math.pow((x / width - .5) / .41, 8));
        return 1 - .70 * title * (1 - reading) - .52 * text * reading;
      };
      ctx.clearRect(0, 0, width, height);
      for (const batch of batches) batch.length = 0;
      const add = (x: number, y: number, radius: number, alpha: number) => {
        if (x < -3 || x > width + 3 || y < -3 || y > height + 3) return;
        const shade = Math.min(13, Math.floor(alpha * 20));
        if (shade > 0) batches[shade].push(x, y, radius);
      };
      for (let i = 0; i < terrain.length; i += width < 640 ? 2 : 1) {
        const p = terrain[i];
        const screen = project(p.x, p.z, p.height);
        add(screen.x, screen.y, p.size * (width < 640 ? .76 : 1), p.intensity * opacity(screen.x, screen.y));
      }
      for (let streamIndex = 0; streamIndex < streams.length; streamIndex += width < 640 ? 2 : 1) {
        const stream = streams[streamIndex];
        for (let dot = 0; dot < 17; dot++) {
          const u = (dot / 17 + stream.phase / TAU + time * stream.speed + scroll * .022) % 1;
          const position = u * (stream.path.length - 1);
          const index = Math.floor(position), blend = position - index;
          const a = stream.path[index], b = stream.path[Math.min(index + 1, stream.path.length - 1)];
          const p = project(a.x + (b.x - a.x) * blend, a.z + (b.z - a.z) * blend, a.height + (b.height - a.height) * blend);
          const fade = Math.min(1, u * 8, (1 - u) * 7);
          const intensity = (.38 + .20 * Math.sin(u * Math.PI)) * fade * opacity(p.x, p.y);
          add(p.x, p.y, width < 640 ? .75 : 1.03, intensity);
        }
      }
      // One neutral ink, with batched shades keeping the denser field inexpensive.
      for (let shade = 1; shade < batches.length; shade++) {
        const batch = batches[shade];
        ctx.fillStyle = `rgba(42,42,42,${shade / 20})`;
        ctx.beginPath();
        for (let i = 0; i < batch.length; i += 3) {
          ctx.moveTo(batch[i] + batch[i + 2], batch[i + 1]);
          ctx.arc(batch[i], batch[i + 1], batch[i + 2], 0, TAU);
        }
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
    const sizing = new ResizeObserver(resize);sizing.observe(canvas);
    document.addEventListener('visibilitychange', restart);reduced.addEventListener('change', restart);
    return () => {
      cancelAnimationFrame(frame);sizing.disconnect();
      document.removeEventListener('visibilitychange', restart);reduced.removeEventListener('change', restart);
    };
  }, [paused]);

  return <>
    <canvas className="particle-background" ref={canvasRef} aria-hidden="true" />
    <button className="motion-control" aria-label={paused ? 'Play hill-climbing animation' : 'Pause hill-climbing animation'} title={paused ? 'Play hill-climbing animation' : 'Pause hill-climbing animation'} onClick={() => setPaused(value => !value)} aria-pressed={paused}>
      <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
    </button>
  </>;
}
