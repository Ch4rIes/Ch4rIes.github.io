import { useEffect, useRef, useState } from 'react';
import land from './world-land.json';

const radians = Math.PI / 180;
// Sampled from Natural Earth 1:110m land polygons (public domain).
// All coordinates are bundled locally; no map service or network requests.
const continents = land.map(([longitude, latitude]) => {
  const lat = latitude * radians, lon = longitude * radians;
  return { x: Math.cos(lat) * Math.sin(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.cos(lon) };
});

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
      // A restrained atmospheric rim, without an opaque sphere behind the text.
      const atmosphere = ctx.createRadialGradient(cx, cy, radius * .8, cx, cy, radius * 1.08);
      atmosphere.addColorStop(0, 'rgba(102,130,127,0)');
      atmosphere.addColorStop(.65, 'rgba(102,130,127,.07)');
      atmosphere.addColorStop(1, 'rgba(102,130,127,0)');
      ctx.fillStyle = atmosphere;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(66,94,87,.32)';
      ctx.lineWidth = .75;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      const trace = (latitude: number | null, longitude: number | null) => {
        ctx.beginPath();
        let drawing = false;
        for (let i = 0; i <= 180; i++) {
          const lat = latitude === null ? (-90 + i) * radians : latitude * radians;
          const lon = longitude === null ? i * 2 * radians : longitude * radians;
          const p = project(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
          if (p.depth < 0) { drawing = false; continue; }
          if (drawing) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
          drawing = true;
        }
        ctx.stroke();
      };
      ctx.strokeStyle = 'rgba(66,94,87,.18)';
      ctx.lineWidth = .65;
      for (let latitude = -60; latitude <= 60; latitude += 30) trace(latitude, null);
      for (let longitude = 0; longitude < 360; longitude += 30) trace(null, longitude);

      for (const point of continents) {
        const p = project(point.x, point.y, point.z);
        if (p.depth <= 0) continue;
        const alpha = .30 + p.depth * .42;
        ctx.fillStyle = `rgba(66,94,87,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (width < 640 ? 1.5 : 2.1) * (.7 + p.depth * .3), 0, Math.PI * 2);
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
