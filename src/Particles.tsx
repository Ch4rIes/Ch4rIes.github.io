import { useEffect, useRef, useState } from 'react';

const MAX_PARTICLES = 180000;
const vertex = `
precision highp float;
attribute vec4 a_seed;
attribute vec2 a_style;
uniform vec2 u_resolution;
uniform float u_dpr, u_time, u_scroll, u_impulse, u_velocity;
varying mediump vec2 v_direction;
varying mediump float v_length, v_box, v_alpha;

vec2 flow(float life, float time) {
  // One broad inward current. The small offset keeps the center finite and continuous.
  float r = .003 + 1.45 * (sqrt(.035 + life) - sqrt(.035)) / (sqrt(1.035) - sqrt(.035));
  float angle = a_seed.x + 1.85 * log(.12 + r) - time * .025 - u_impulse * .24;
  r *= 1.0 + .10 * sin(2.0 * angle);
  return vec2(r * cos(angle) + .15 * r * r,
    r * sin(angle) + .09 * r * r * cos(angle));
}
void main() {
  float compact = 1.0 - step(640.0, u_resolution.x);
  vec2 center = u_resolution * vec2(.56 + sin(u_scroll * .3) * .035, .59 - sin(u_scroll * .25) * .035);
  vec2 scale = u_resolution * vec2(mix(.63, .92, compact), .68);
  float turn = -.18 + sin(u_time * .022) * .04 + atan(u_scroll * .3) * .12;
  float ct = cos(turn), st = sin(turn);
  float life = fract(a_seed.y - u_time * .022 - u_impulse * .035);
  vec2 p = flow(life, u_time);
  // Unwrapped finite differences include both radial and angular velocity.
  vec2 tangent = flow(life - .022 * .035, u_time + .035) - p;
  vec2 screen = center + vec2(p.x * ct - p.y * st, p.y * ct + p.x * st) * scale;
  tangent = vec2(tangent.x * ct - tangent.y * st, tangent.y * ct + tangent.x * st) * scale;
  v_direction = normalize(tangent);
  float radius = length(p);
  // Long outer filaments resolve into fine points as they reach the source.
  float trail = smoothstep(.045, 1.05, radius);
  v_length = min(25.0, (.06 + 10.0 * trail) * (.65 + a_style.x * .22) * (1.0 + abs(u_velocity) * .30));
  v_box = v_length + 3.0;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float nearSide = pow(.5 + .5 * cos(angle - 2.3), 3.0);
  float illuminatedFold = exp(-pow(abs((r - .40) / .25), 2.0)) * nearSide;
  float centerLight = exp(-r * r / .06);
  float fade = 1.0 - smoothstep(.93, 1.0, life);
  vec2 uv = screen / u_resolution;
  float title = exp(-pow(abs((uv.x - .5) / .30), 4.0) - pow(abs((uv.y - .43) / .10), 4.0));
  float text = exp(-pow(abs((uv.x - .5) / .40), 8.0));
  float reading = min(1.0, u_scroll / .8);
  v_alpha = a_style.y * (.29 + .43 * illuminatedFold + .38 * centerLight) * fade
    * (1.0 - .34 * title * (1.0 - reading) - .38 * text * reading);
  gl_Position = vec4(screen.x / u_resolution.x * 2.0 - 1.0, 1.0 - screen.y / u_resolution.y * 2.0, 0.0, 1.0);
  gl_PointSize = v_box * u_dpr;
}`;
const fragment = `
precision mediump float;
varying mediump vec2 v_direction;
varying mediump float v_length, v_box, v_alpha;
void main() {
  vec2 p = (gl_PointCoord - .5) * v_box;
  float along = dot(p, v_direction);
  float across = dot(p, vec2(-v_direction.y, v_direction.x));
  float end = max(abs(along) - v_length * .36, 0.0);
  float distance2 = end * end + across * across;
  // Subpixel filaments with soft ends and a very small halo, all in one champagne-gold ink.
  float core = exp(-distance2 / .15);
  float halo = exp(-distance2 / 1.4) * .07;
  float alpha = v_alpha * (core + halo);
  if (alpha < .004) discard;
  gl_FragColor = vec4(.98, .81, .53, alpha);
}`;
const lightVertex = `
attribute vec2 a_position;
varying mediump vec2 v_uv;
void main() { v_uv = vec2(a_position.x * .5 + .5, .5 - a_position.y * .5); gl_Position = vec4(a_position, 0.0, 1.0); }
`;
const lightFragment = `
precision mediump float;
varying mediump vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time, u_scroll, u_velocity;
void main() {
  float compact = 1.0 - step(640.0, u_resolution.x);
  vec2 center = vec2(.56 + sin(u_scroll * .3) * .035, .59 - sin(u_scroll * .25) * .035);
  vec2 p = (v_uv - center) / vec2(mix(.63, .92, compact), .68);
  float turn = -.18 + sin(u_time * .022) * .04 + atan(u_scroll * .3) * .12;
  p = vec2(p.x * cos(turn) + p.y * sin(turn), p.y * cos(turn) - p.x * sin(turn));
  float r = length(p);
  p -= vec2(.15 * r * r, .09 * r * p.x);
  float angle = atan(p.y, p.x);
  r = length(p) / (1.0 + .10 * sin(angle * 2.0));
  float nearSide = pow(.5 + .5 * cos(angle - 2.3), 3.0);
  float source = exp(-r * r / .036);
  float radiance = exp(-r * r / .16);
  float fold = exp(-pow(abs((r - .25) / .18), 2.0)) * nearSide;
  float reading = min(1.0, u_scroll / .8);
  float power = 1.0 + abs(u_velocity) * .04;
  float glow = (.26 * source + .07 * radiance + .14 * fold) * power * (1.0 - .28 * reading);
  vec3 gold = mix(vec3(.98, .81, .53), vec3(.98, .88, .70), source);
  gl_FragColor = vec4(gold, glow);
}`;

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, index) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not create particle shader');
    gl.shaderSource(shader, index === 0 ? vertexSource : fragmentSource);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || 'Could not compile particle shader');
    }
    return shader;
  });
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create particle program');
  shaders.forEach(shader => gl.attachShader(program, shader));
  gl.linkProgram(program);
  shaders.forEach(shader => gl.deleteShader(shader));
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message || 'Could not link particle program');
  }
  return program;
}

function createSeeds() {
  let seed = 193;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  const data = new Float32Array(MAX_PARTICLES * 6);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const offset = i * 6;
    data[offset] = random() * Math.PI * 2;
    data[offset + 1] = random();
    data[offset + 2] = random();
    data[offset + 3] = random();
    data[offset + 4] = 1.7 + random() * 2.0;
    data[offset + 5] = .48 + random() * .52;
  }
  return data;
}
const seeds = createSeeds();

export default function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef({ time: 0, scroll: 0, velocity: 0, impulse: 0 });
  const [paused, setPaused] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) { setAvailable(false); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = innerWidth, height = innerHeight, dpr = 1, count = 0, frame = 0, last = 0;
    let previousScroll = window.scrollY;
    let disposed = false;
    const current = scene.current;
    type Pipeline = { program: WebGLProgram; buffer: WebGLBuffer; seed: number; style: number;
      resolution: WebGLUniformLocation | null; time: WebGLUniformLocation | null;
      scroll: WebGLUniformLocation | null; dpr: WebGLUniformLocation | null;
      impulse: WebGLUniformLocation | null; velocity: WebGLUniformLocation | null };
    let field: Pipeline | undefined, light: Pipeline | undefined;
    const setup = (isLight: boolean): Pipeline => {
      const program = createProgram(gl, isLight ? lightVertex : vertex, isLight ? lightFragment : fragment);
      const buffer = gl.createBuffer();
      if (!buffer) { gl.deleteProgram(program); throw new Error('Could not create particle buffer'); }
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, isLight ? new Float32Array([-1, -1, 3, -1, -1, 3]) : seeds, gl.STATIC_DRAW);
      return { program, buffer, seed: gl.getAttribLocation(program, isLight ? 'a_position' : 'a_seed'),
        style: isLight ? -1 : gl.getAttribLocation(program, 'a_style'),
        resolution: gl.getUniformLocation(program, 'u_resolution'), time: gl.getUniformLocation(program, 'u_time'),
        scroll: gl.getUniformLocation(program, 'u_scroll'), dpr: gl.getUniformLocation(program, 'u_dpr'),
        impulse: gl.getUniformLocation(program, 'u_impulse'), velocity: gl.getUniformLocation(program, 'u_velocity') };
    };
    const release = () => {
      for (const pipeline of [field, light]) {
        if (pipeline) { gl.deleteBuffer(pipeline.buffer); gl.deleteProgram(pipeline.program); }
      }
      field = light = undefined;
    };
    const initialize = () => {
      try {
        field = setup(false); light = setup(true);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(0, 0, 0, 0);
        setAvailable(true);
      } catch {
        release();
        setAvailable(false);
      }
    };
    const draw = (now: number) => {
      if (disposed || !field || !light || gl.isContextLost()) return;
      const still = paused || reduced.matches;
      const dt = Math.min(Math.max((now - last) / 1000, 0), .05);
      last = now;
      if (!still) {
        const target = Math.max(0, window.scrollY);
        const velocity = Math.max(-2, Math.min(2, (target - previousScroll) / Math.max(height * dt, 1)));
        current.velocity += (velocity - current.velocity) * (1 - Math.exp(-dt * 4));
        current.scroll += (target / height - current.scroll) * (1 - Math.exp(-dt * 4));
        current.impulse += Math.abs(current.velocity) * dt * .055;
        current.time += dt * .30 * (1 + Math.abs(current.velocity) * .60);
        previousScroll = target;
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (const pipeline of [light, field]) {
        const isLight = pipeline === light;
        gl.useProgram(pipeline.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, pipeline.buffer);
        gl.enableVertexAttribArray(pipeline.seed);
        gl.vertexAttribPointer(pipeline.seed, isLight ? 2 : 4, gl.FLOAT, false, isLight ? 0 : 24, 0);
        if (!isLight) {
          gl.enableVertexAttribArray(pipeline.style);
          gl.vertexAttribPointer(pipeline.style, 2, gl.FLOAT, false, 24, 16);
        }
        gl.uniform2f(pipeline.resolution, width, height);
        gl.uniform1f(pipeline.time, reduced.matches ? 0 : current.time);
        gl.uniform1f(pipeline.scroll, reduced.matches ? 0 : current.scroll);
        gl.uniform1f(pipeline.dpr, dpr);
        gl.uniform1f(pipeline.impulse, reduced.matches ? 0 : current.impulse);
        gl.uniform1f(pipeline.velocity, reduced.matches ? 0 : current.velocity);
        gl.drawArrays(isLight ? gl.TRIANGLES : gl.POINTS, 0, isLight ? 3 : count);
        gl.disableVertexAttribArray(pipeline.seed);
        if (!isLight) gl.disableVertexAttribArray(pipeline.style);
      }
      if (!still && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      previousScroll = window.scrollY;
      last = performance.now();
      if (!document.hidden) draw(last);
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      dpr = Math.min(devicePixelRatio || 1, width < 640 ? 2 : 1.6);
      count = Math.min(MAX_PARTICLES, Math.max(36000, Math.round(width * height * .16)));
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      restart();
    };
    const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setAvailable(false); };
    const restored = () => { initialize(); resize(); };
    initialize(); resize();
    const sizing = new ResizeObserver(resize); sizing.observe(canvas);
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame); sizing.disconnect(); release();
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      document.removeEventListener('visibilitychange', restart);
      reduced.removeEventListener('change', restart);
    };
  }, [paused]);

  return <>
    <canvas className="particle-background" ref={canvasRef} aria-hidden="true" />
    {available && <button className="motion-control" aria-label={paused ? 'Play particle animation' : 'Pause particle animation'} title={paused ? 'Play particle animation' : 'Pause particle animation'} onClick={() => setPaused(value => !value)} aria-pressed={paused}>
      <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
    </button>}
  </>;
}
