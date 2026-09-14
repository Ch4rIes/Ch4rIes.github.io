import { useEffect, useRef, useState } from 'react';
import { createFlowRenderer } from './FlowRenderer';

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef({ time: 0, scroll: 0, velocity: 0 });
  const [paused, setPaused] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) { setAvailable(false); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let renderer: ReturnType<typeof createFlowRenderer> | undefined;
    let width = innerWidth, height = innerHeight, frame = 0, last = 0, disposed = false;
    let previousScroll = window.scrollY;
    const current = scene.current;
    const draw = (now: number) => {
      if (disposed || !renderer || gl.isContextLost()) return;
      const still = paused || reduced.matches;
      const dt = Math.min(Math.max((now - last) / 1000, 0), .05);
      last = now;
      if (!still) {
        const target = Math.max(0, window.scrollY);
        const velocity = Math.max(-2, Math.min(2, (target - previousScroll) / Math.max(height * dt, 1)));
        current.velocity += (velocity - current.velocity) * (1 - Math.exp(-dt * 4));
        current.scroll += (target / height - current.scroll) * (1 - Math.exp(-dt * 4));
        current.time += dt * (1 + Math.abs(current.velocity) * .25);
        previousScroll = target;
      }
      renderer.draw({ time: reduced.matches ? 0 : current.time, scroll: reduced.matches ? 0 : current.scroll,
        reading: Math.max(0, window.scrollY / height) });
      if (!still && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame); previousScroll = window.scrollY; last = performance.now();
      if (!document.hidden) draw(last);
    };
    const resize = () => {
      if (!renderer || gl.isContextLost()) return;
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2500000 / (width * height)));
      const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      try { renderer.resize(width, height, dpr); restart(); }
      catch { renderer.dispose(); renderer = undefined; setAvailable(false); }
    };
    const initialize = () => {
      try { renderer = createFlowRenderer(gl); setAvailable(true); resize(); }
      catch { renderer?.dispose(); renderer = undefined; setAvailable(false); }
    };
    const onScroll = () => { if (paused || reduced.matches) restart(); };
    const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setAvailable(false); };
    const restored = () => { renderer = undefined; initialize(); };
    initialize();
    const sizing = new ResizeObserver(resize); sizing.observe(canvas);
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
    window.addEventListener('resize', resize); window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', restart); reduced.addEventListener('change', restart);
    return () => {
      disposed = true; cancelAnimationFrame(frame); sizing.disconnect(); renderer?.dispose();
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      window.removeEventListener('resize', resize); window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', restart); reduced.removeEventListener('change', restart);
    };
  }, [paused]);

  return <>
    <canvas className="particle-background" ref={canvasRef} aria-hidden="true" style={available ? undefined : { visibility: 'hidden' }} />
    {available && <button className="motion-control" aria-label={paused ? 'Play background animation' : 'Pause background animation'} title={paused ? 'Play background animation' : 'Pause background animation'} onClick={() => setPaused(value => !value)} aria-pressed={paused}>
      <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
    </button>}
  </>;
}
