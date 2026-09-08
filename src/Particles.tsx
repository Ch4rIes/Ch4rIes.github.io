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
const terrain = Array.from({ length: 5400 }, (_, i) => {
  const x = -4.3 + (i % 100) * .087 + (random() - .5) * .045;
  const z = -2.7 + Math.floor(i / 100) * .102 + (random() - .5) * .045;
  return { x, z, height: reward(x, z), size: .55 + random() * .7 };
});
type Agent = { x: number; z: number; vx: number; vz: number; phase: number; age: number; life: number; trail: Array<{ x: number; z: number }> };
function createScene() {
  const rand = randomSource(281);
  const spawn = (): Agent => ({ x: (rand() - .5) * 7, z: (rand() - .5) * 4.8, vx: 0, vz: 0,
    phase: rand() * TAU, age: 0, life: 17 + rand() * 18, trail: [] });
  return { time: 0, scroll: 0, velocity: 0, trailClock: 0, spawn,
    agents: Array.from({ length: 72 }, () => { const agent = spawn(); agent.age = rand() * agent.life; return agent; }) };
}

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ReturnType<typeof createScene> | null>(null);
  if (!scene.current) scene.current = createScene();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = innerWidth, height = innerHeight, frame = 0, last = 0;
    let previousScroll = window.scrollY;
    const current = scene.current!;
    const draw = (now: number) => {
      const still = paused || reduced.matches;
      if (!still && now - last < 25) { frame = requestAnimationFrame(draw); return; }
      const dt = Math.min((now - last) / 1000, .05);
      last = now;
      if (!still) {
        const target = window.scrollY;
        const velocity = Math.max(-2, Math.min(2, (target - previousScroll) / Math.max(height * dt, 1)));
        current.velocity += (velocity - current.velocity) * (1 - Math.exp(-dt * 5));
        current.scroll += (target / height - current.scroll) * (1 - Math.exp(-dt * 6));
        current.time += dt;
        previousScroll = target;
        current.trailClock += dt;
        const recordTrail = current.trailClock > .10;
        if (recordTrail) current.trailClock = 0;
        for (let i = 0; i < current.agents.length; i++) {
          const agent = current.agents[i];
          agent.age += dt;
          if (agent.age > agent.life) { current.agents[i] = current.spawn(); continue; }
          const grad = gradient(agent.x, agent.z);
          const slope = Math.hypot(grad.x, grad.z);
          // Finish successful climbs sooner so summits do not become crowded.
          if (slope < .13 && agent.age > 7) agent.age += dt * 2.5;
          const norm = Math.max(.5, slope);
          const exploration = .09 + Math.abs(current.velocity) * .07;
          const vx = grad.x / norm * .36 + Math.sin(current.time * .7 + agent.phase) * exploration;
          const vz = grad.z / norm * .36 + Math.cos(current.time * .57 + agent.phase * 2) * exploration;
          const damping = 1 - Math.exp(-dt * 3);
          agent.vx += (vx - agent.vx) * damping;
          agent.vz += (vz - agent.vz) * damping;
          agent.x = Math.max(-4.15, Math.min(4.15, agent.x + agent.vx * dt));
          agent.z = Math.max(-2.6, Math.min(2.6, agent.z + agent.vz * dt));
          if (recordTrail) { agent.trail.push({ x: agent.x, z: agent.z }); if (agent.trail.length > 19) agent.trail.shift(); }
        }
      }
      const scroll = reduced.matches ? 0 : current.scroll;
      const time = reduced.matches ? 0 : current.time;
      const reading = Math.min(1, scroll / .8);
      const yaw = -.16 + Math.sin(scroll * .35) * .25 + Math.sin(time * .035) * .025;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const vertical = Math.min(height * .19, width * .27);
      const project = (x: number, z: number, elevation: number) => ({
        x: width * .5 + (x * cos - z * sin) * width * .143,
        y: height * (.88 - reading * .08) + (z * cos + x * sin) * vertical * .30 - elevation * vertical,
      });
      const opacity = (x: number, y: number) => {
        const title = Math.exp(-Math.pow((x / width - .5) / .34, 4) - Math.pow((y / height - .43) / .18, 4));
        const text = Math.exp(-Math.pow((x / width - .5) / .41, 8));
        return 1 - .78 * (title * (1 - reading) + text * reading);
      };
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < terrain.length; i += width < 640 ? 2 : 1) {
        const p = terrain[i];
        const screen = project(p.x, p.z, p.height);
        const boundary = Math.min(1, (4.35 - Math.abs(p.x)) * 2, (2.8 - Math.abs(p.z)) * 2);
        const alpha = (.22 + p.height * .14) * boundary * opacity(screen.x, screen.y);
        ctx.fillStyle = `rgba(74,98,108,${alpha})`;
        ctx.beginPath(); ctx.arc(screen.x, screen.y, p.size * (width < 640 ? .82 : 1), 0, TAU); ctx.fill();
      }
      for (const agent of current.agents) {
        const fade = Math.max(0, Math.min(1, agent.age / 2, (agent.life - agent.age) / 3));
        for (let i = 0; i < agent.trail.length; i += 2) {
          const tail = agent.trail[i];
          const p = project(tail.x, tail.z, reward(tail.x, tail.z));
          ctx.fillStyle = `rgba(146,105,62,${.30 * (i / agent.trail.length) * fade * opacity(p.x, p.y)})`;
          ctx.beginPath();ctx.arc(p.x, p.y, .85, 0, TAU);ctx.fill();
        }
        const p = project(agent.x, agent.z, reward(agent.x, agent.z));
        const alpha = .85 * fade * opacity(p.x, p.y);
        ctx.fillStyle = `rgba(145,97,48,${alpha})`;
        ctx.beginPath();ctx.arc(p.x, p.y, width < 640 ? 1.75 : 2.1, 0, TAU);ctx.fill();
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
