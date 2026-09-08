import { useEffect, useRef, useState } from 'react';
import land from './world-land.json';

const radians = Math.PI / 180;
// Sampled from Natural Earth 1:110m land polygons (public domain).
// All coordinates are bundled locally; no map service or network requests.
let seed = 73;
const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
const makePoint = (longitude: number, latitude: number, land: boolean) => {
  const lat = (latitude + (random() - .5) * 1.6) * radians;
  const lon = (longitude + (random() - .5) * 1.6) * radians;
  return {
    x: Math.cos(lat) * Math.sin(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.cos(lon),
    phase: random() * Math.PI * 2, speed: .35 + random() * .5,
    size: .65 + random() * 1.1, spread: random(), land,
  };
};
const points = [
  ...land.map(([longitude, latitude]) => makePoint(longitude, latitude, true)),
  // Sparse free particles suggest the oceans and soften the globe's edge.
  ...Array.from({ length: 850 }, () => makePoint(random() * 360 - 180,
    Math.asin(random() * 2 - 1) / radians, false)),
];

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(.55);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = innerWidth, height = innerHeight, frame = 0, last = 0;
    let scroll = window.scrollY;

    const draw = (now: number) => {
      const still = paused || reduced.matches;
      if (!still && now - last < 32) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const delta = Math.min(now - last, 50);
      last = now;
      if (!still) {
        rotation.current += delta * .000035;
        scroll += (window.scrollY - scroll) * .045;
      }
      const angle = reduced.matches ? .55 : rotation.current + scroll / height * .16;
      const radius = Math.min(width * .70, height * .66);
      const cx = width * (width < 640 ? .63 : .72), cy = height * .69;
      const tilt = -.18;
      const sin = Math.sin(angle), cos = Math.cos(angle);
      const project = (x: number, y: number, z: number) => {
        const rx = x * cos + z * sin;
        const depth = z * cos - x * sin;
        return {
          x: cx + (rx * Math.cos(tilt) - y * Math.sin(tilt)) * radius,
          y: cy - (rx * Math.sin(tilt) + y * Math.cos(tilt)) * radius,
          depth,
        };
      };
      ctx.clearRect(0, 0, width, height);
      const time = reduced.matches ? 0 : (rotation.current - .55) * 8;
      for (const point of points) {
        // Independent drifting phases keep the globe from moving like a rigid shell.
        const drift = Math.sin(time * point.speed + point.phase);
        const looseness = point.land ? .012 + point.spread ** 4 * .08 : .06 + point.spread * .18;
        const shell = 1 + drift * looseness;
        const p = project(
          point.x * shell + Math.sin(time * .35 + point.phase) * looseness * .45,
          point.y * shell + Math.cos(time * .28 + point.phase) * looseness * .45,
          point.z * shell,
        );
        // A soft depth fade lets points emerge around the horizon without popping.
        const front = Math.min(1, Math.max(0, (p.depth + .12) / .32));
        const depth = Math.max(0, p.depth);
        const alpha = (point.land ? .26 + depth * .38 : .10 + depth * .13)
          * front * (.85 + drift * .15);
        if (alpha < .005) continue;
        ctx.fillStyle = `rgba(66,94,87,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (width < 640 ? 1.3 : 1.8) * point.size * (.7 + depth * .3), 0, Math.PI * 2);
        ctx.fill();
      }
      if (!still && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      last = performance.now() - 33;
      if (!document.hidden) draw(performance.now());
    };
    const resize = () => {
      width = innerWidth; height = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = width * dpr; canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      restart();
    };
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', restart);
      reduced.removeEventListener('change', restart);
    };
  }, [paused]);

  return <>
    <canvas className="particles world-background" ref={canvasRef} aria-hidden="true" />
    <button className="motion-control" aria-label={paused ? 'Play globe rotation' : 'Pause globe rotation'} title={paused ? 'Play globe rotation' : 'Pause globe rotation'} onClick={() => setPaused(value => !value)} aria-pressed={paused}>
      <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
    </button>
  </>;
}
