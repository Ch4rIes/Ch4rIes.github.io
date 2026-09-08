import { useEffect, useRef, useState } from 'react';

type ProjectedPoint = { x: number; y: number; depth: number; opacity: number };

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeline = useRef({ time: 0, scroll: 0 });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = innerWidth, height = innerHeight;
    let frame = 0, last = 0;
    let pointer = { x: -2000, y: -2000 };
    const cursor = { x: -2000, y: -2000, strength: 0 };
    let seed = 47;
    const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
    const points = Array.from({ length: width < 640 ? 4700 : 8600 }, () => ({
      start: random(), band: Math.floor(random() * 5), spread: random() - .5,
      volume: random() - .5, size: .5 + random() * 1.25, speed: .8 + random() * .4,
    }));

    const draw = (now: number) => {
      const still = paused || reduced.matches;
      if (!still && now - last < 32) { frame = requestAnimationFrame(draw); return; }
      const delta = Math.min(Math.max(now - last, 0), 50);
      last = now;
      if (!still) {
        timeline.current.time += delta * .00019;
        timeline.current.scroll += (scrollY / height - timeline.current.scroll) * .055;
        cursor.strength += ((pointer.x > -1000 ? 1 : 0) - cursor.strength) * .065;
        if (pointer.x > -1000) {
          cursor.x += (pointer.x - cursor.x) * .12;
          cursor.y += (pointer.y - cursor.y) * .12;
        }
      }
      const time = reduced.matches ? 0 : timeline.current.time;
      const scroll = reduced.matches ? 0 : timeline.current.scroll;
      const scale = Math.min(width * .42, height * .78);
      const tilt = -.13 + Math.sin(scroll * .4) * .13;
      const cos = Math.cos(tilt), sin = Math.sin(tilt);
      const colors = ['39,51,48', '46,65,66', '50,104,128', '90,121,130', '111,104,83'];
      ctx.clearRect(0, 0, width, height);

      // Braided ribbons share a winding spine; each twists through a different depth.
      const project = (u: number, band: number, spread: number, volume = 0): ProjectedPoint => {
        const centered = (u - .5) * 3.7;
        const twist = u * Math.PI * 3.8 + time * .32 + band * 1.06 + scroll * .38;
        const radius = .14 + .1 * Math.sin(u * Math.PI) + spread * .075;
        const spine = Math.sin(u * Math.PI * 2.1 + time * .16 + scroll * .24) * .27;
        const y = spine + Math.cos(twist) * radius + (band - 2) * .06 + spread * .15;
        const z = Math.sin(twist) * radius * 1.9 + volume * .16;
        const perspective = 2.6 / (2.6 + z);
        const rotatedX = centered * cos - y * sin;
        const rotatedY = centered * sin + y * cos;
        let x = width * .5 + rotatedX * scale * perspective;
        let screenY = height * (.75 - Math.sin(scroll * .55) * .13) + rotatedY * scale * perspective;
        if (!still && cursor.strength > .001) {
          const dx = x - cursor.x, dy = screenY - cursor.y;
          const radius = 170;
          const influence = Math.exp(-(dx * dx + dy * dy) / (radius * radius)) * cursor.strength;
          // A local whirlpool bends the current, then lets it settle back into its path.
          x += (-dy * .32 + dx * .09) * influence;
          screenY += (dx * .32 + dy * .09) * influence;
        }
        const quiet = Math.exp(-Math.pow((x - width * .5) / (width * .3), 4)
          - Math.pow((screenY - height * .43) / (height * .23), 4));
        const edge = Math.min(1, Math.max(0, Math.sin(u * Math.PI) * 4));
        return { x, y: screenY, depth: perspective, opacity: (1 - quiet * .91) * edge };
      };

      // Fine filaments make the underlying motion readable between the particles.
      ctx.lineWidth = .6;
      for (let band = 0; band < 5; band++) {
        for (let strand = 0; strand < 3; strand++) {
          ctx.beginPath();
          for (let step = 0; step <= 90; step++) {
            const p = project(step / 90, band, (strand - 1) * .27);
            if (step === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          }
          ctx.strokeStyle = `rgba(${colors[band]},.075)`;
          ctx.stroke();
        }
      }

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const u = (p.start + time * .029 * p.speed) % 1;
        const projected = project(u, p.band, p.spread, p.volume);
        const pulseDistance = (u - time * .075 - p.band * .17 + 100) % 1;
        const pulse = Math.exp(-Math.pow((pulseDistance - .5) * 17, 2));
        const alpha = Math.min(.85, (.35 + p.volume * .22 + pulse * .25) * projected.opacity);
        const size = p.size * projected.depth * (1 + pulse * .3);
        ctx.fillStyle = `rgba(${colors[p.band]},${alpha})`;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, size, 0, Math.PI * 2);
        ctx.fill();
        if (i % 9 === 0 && u > .005) {
          const tail = project(u - .005, p.band, p.spread, p.volume);
          ctx.strokeStyle = `rgba(${colors[p.band]},${alpha * .42})`;
          ctx.lineWidth = .65;
          ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(projected.x, projected.y); ctx.stroke();
        }
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
    const move = (event: PointerEvent) => {
      if (pointer.x < -1000) { cursor.x = event.clientX; cursor.y = event.clientY; }
      pointer = { x: event.clientX, y: event.clientY };
    };
    const leave = () => { pointer = { x: -2000, y: -2000 }; };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move);
    window.addEventListener('blur', leave);
    document.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('blur', leave);
      document.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', restart);
      reduced.removeEventListener('change', restart);
    };
  }, [paused]);

  return <>
    <canvas className="particles" ref={canvasRef} aria-hidden="true" />
    <button className="motion-control" onClick={() => setPaused(value => !value)} aria-pressed={paused}>
      {paused ? 'Play motion' : 'Pause motion'} <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
    </button>
  </>;
}
