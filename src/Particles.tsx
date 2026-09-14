import { useEffect, useRef, useState } from 'react';

const MAX_PARTICLES = 120000;
// The light and the grains share a tilted, recessed surface, so their depth agrees.
const projection = `
vec3 surface(float radius, float angle, float layer) {
  float depth = -.60 * exp(-radius * radius / .28);
  depth += layer * .075 * sqrt(min(radius, 1.0));
  return vec3(radius * cos(angle), radius * sin(angle), depth);
}
vec3 camera(vec3 p) {
  float tilt = 1.12 + atan(u_scroll * .25) * .055;
  float roll = .24 + sin(u_scroll * .24) * .035;
  float y = p.y * cos(tilt) - p.z * sin(tilt);
  float depth = p.y * sin(tilt) + p.z * cos(tilt);
  float perspective = 3.5 / (3.5 - depth);
  return vec3(vec2(p.x * cos(roll) - y * sin(roll), p.x * sin(roll) + y * cos(roll)) * perspective, depth);
}
vec2 screenPosition(vec3 p) {
  float compact = 1.0 - smoothstep(540.0, 760.0, u_resolution.x);
  vec2 focus = vec2(.53 + sin(u_time * .012) * .008, .66);
  float scale = mix(min(u_resolution.x * .37, u_resolution.y * .60), u_resolution.x * .56, compact);
  vec2 tip = camera(surface(0.0, 0.0, 0.0)).xy;
  return focus * u_resolution + (camera(p).xy - tip) * scale;
}
`;

const vertex = `
precision highp float;
attribute vec2 a_position;
uniform vec2 u_resolution;
uniform float u_time, u_scroll;
varying mediump vec2 v_uv, v_tip;
varying mediump vec4 v_fold[4];
${projection}
void main() {
  v_uv = vec2(a_position.x * .5 + .5, .5 - a_position.y * .5);
  v_tip = screenPosition(surface(0.0, 0.0, 0.0)) / u_resolution;
  for (int i = 0; i < 4; i++) {
    float angle = float(i) * 1.570796;
    v_fold[i] = vec4(screenPosition(surface(.24, angle, 0.0)) / u_resolution,
      screenPosition(surface(.24, angle + .785398, 0.0)) / u_resolution);
  }
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragment = `
precision highp float;
varying mediump vec2 v_uv, v_tip;
varying mediump vec4 v_fold[4];
uniform sampler2D u_grain;
uniform vec2 u_resolution;
uniform float u_reading;
mat2 rotate(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }
float noise(vec2 p) { return texture2D(u_grain, p / 512.0).r; }
float material(vec2 p) {
  return .57 * noise(p) + .28 * noise(p * 2.03 + 173.0) + .15 * noise(p * 4.11 + 291.0);
}
void main() {
  vec2 uv = v_uv;
  float reading = smoothstep(.15, .90, u_reading);
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 delta = (uv - v_tip) * aspect;
  float clouds = material(uv * vec2(3.7, 4.3) + vec2(0.0, 28.0));
  vec2 pixels = (uv - vec2(.53, .66)) * u_resolution;
  float bend = .62 * exp(-dot(delta, delta) * 2.4);
  vec2 brushed = rotate(-.76 + bend) * pixels;
  brushed.y += sin(brushed.x / 380.0) * 24.0;
  float fibers = material(brushed * vec2(.23, 1.85) + 37.0);
  float fineFibers = noise(rotate(.10) * brushed * vec2(.57, 3.40) + 131.0);
  float pores = noise(uv * u_resolution * 1.10 + 219.0);
  float grain = (fibers - .5) * .085 + (fineFibers - .5) * .034 + (pores - .5) * .026;

  // Overlapping sources follow the inner fold in perspective. A filled throat
  // and broad shoulder dissolve the rim into one soft, asymmetrical reflection.
  float reflection = 0.0;
  float glowSize = mix(.028, .048, smoothstep(.65, 1.3, aspect.x));
  for (int i = 0; i < 4; i++) {
    float angle = float(i) * 1.570796;
    vec2 a = (uv - v_fold[i].xy) * aspect;
    vec2 b = (uv - v_fold[i].zw) * aspect;
    float facingA = .16 + .84 * pow(.5 + .5 * sin(angle), 2.0);
    float facingB = .16 + .84 * pow(.5 + .5 * sin(angle + .785398), 2.0);
    reflection += .22 * (exp(-dot(a, a) / (glowSize * glowSize)) * facingA
      + exp(-dot(b, b) / (glowSize * glowSize)) * facingB);
    reflection += .035 * (exp(-dot(a, a) / .012) * facingA + exp(-dot(b, b) / .012) * facingB);
  }
  float core = exp(-dot(delta, delta) / .0028);
  float halo = exp(-dot(delta, delta) / .025);
  float light = (.42 * core + reflection + .12 * halo) * (1.0 - reading * .73);
  light *= .98 + (fibers - .5) * .20;
  vec3 shadow = vec3(.373, .353, .322);
  vec3 base = vec3(.482, .455, .416);
  vec3 midtone = vec3(.569, .533, .486);
  vec3 highlight = vec3(.871, .847, .792);
  vec3 hotspot = vec3(.941, .918, .863);
  vec3 metal = mix(base, midtone, clamp((clouds - .38) * 1.15, 0.0, .46));
  float edge = smoothstep(.26, .82, length((uv - vec2(.50, .54)) * vec2(.84, 1.0)));
  metal = mix(metal, shadow, edge * .66 + (1.0 - uv.y) * .12);
  metal *= 1.0 - reading * .25;
  vec3 color = mix(metal, mix(highlight, hotspot, core), min(.88, light));
  color += grain * (1.0 + light * .20);
  gl_FragColor = vec4(color, 1.0);
}`;

const particleVertex = `
precision highp float;
attribute vec4 a_seed;
attribute vec2 a_style;
uniform vec2 u_resolution;
uniform float u_time, u_scroll, u_reading, u_dpr, u_velocity;
varying mediump vec2 v_direction;
varying mediump float v_length, v_box, v_alpha, v_heat;
${projection}
vec3 flow(float life, float time) {
  float radius = 2.30 * (exp(max(life, 0.0) * 1.8) - 1.0) / (exp(1.8) - 1.0);
  float angle = a_seed.x + 1.30 * log(.12 + radius) - time * .018;
  return surface(radius, angle, a_seed.z - .5);
}
void main() {
  // A complete inward journey takes 56 seconds. Grains share the same flow;
  // the outer stream moves visibly while the throat becomes fine, slow points.
  float life = fract(a_seed.y - u_time * .018);
  vec3 p = flow(life, u_time);
  vec2 screen = screenPosition(p);
  vec2 tangent = screen - screenPosition(flow(life + .018 * .04, u_time - .04));
  v_direction = tangent / max(length(tangent), .0001);
  float radius = length(p.xy);
  float outer = smoothstep(.035, 1.20, radius);
  v_length = (.12 + 12.0 * outer) * a_style.x * (1.0 + abs(u_velocity) * .10);
  v_box = v_length + 3.0;
  float front = .5 + .5 * p.y / max(radius, .0001);
  float depthLight = .24 + .76 * front;
  v_heat = exp(-radius * radius / .11);
  float fadeIn = 1.0 - smoothstep(.85, 1.0, life);
  float fadeOut = smoothstep(0.0, .012, life);
  float reading = smoothstep(.15, .90, u_reading);
  vec2 uv = screen / u_resolution;
  vec2 titleOffset = (uv - vec2(.50, .44)) / vec2(.31, .10);
  float title = exp(-dot(titleOffset, titleOffset));
  v_alpha = (.27 + .22 * v_heat) * a_style.y * depthLight * fadeIn * fadeOut;
  v_alpha *= (1.0 - reading * .70) * (1.0 - title * .45);
  gl_Position = vec4(screen.x / u_resolution.x * 2.0 - 1.0, 1.0 - screen.y / u_resolution.y * 2.0, 0.0, 1.0);
  gl_PointSize = v_box * u_dpr;
}`;

const particleFragment = `
precision mediump float;
varying mediump vec2 v_direction;
varying mediump float v_length, v_box, v_alpha, v_heat;
void main() {
  vec2 p = (gl_PointCoord - .5) * v_box;
  float along = dot(p, v_direction);
  float across = dot(p, vec2(-v_direction.y, v_direction.x));
  float end = max(abs(along) - v_length * .36, 0.0);
  float d2 = end * end + across * across;
  float alpha = (exp(-d2 / .19) + .07 * exp(-d2 / 1.40)) * v_alpha;
  if (alpha < .003) discard;
  vec3 champagne = mix(vec3(.84, .79, .68), vec3(.98, .94, .85), v_heat);
  gl_FragColor = vec4(champagne, alpha);
}`;

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create background program');
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create background shader');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || 'Could not compile background shader');
      }
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Could not link background program');
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    shaders.forEach(shader => gl.deleteShader(shader));
  }
}

// Deterministic noise, synthesized locally once. Several incommensurate sample
// scales hide the tile and make the fine material cheaper than per-pixel FBM.
function createGrain() {
  const data = new Uint8Array(512 * 512 * 4);
  let seed = 193;
  for (let i = 0; i < data.length; i += 4) {
    seed = seed * 16807 % 2147483647;
    const value = Math.floor((seed - 1) / 2147483646 * 256);
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  return data;
}
const grain = createGrain();

function createParticles() {
  const data = new Float32Array(MAX_PARTICLES * 6);
  let seed = 193;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const offset = i * 6;
    data[offset] = random() * Math.PI * 2;
    data[offset + 1] = random(); data[offset + 2] = random(); data[offset + 3] = random();
    data[offset + 4] = .65 + random() * .45;
    data[offset + 5] = .50 + random() * .50;
  }
  return data;
}
const particles = createParticles();

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
    let width = innerWidth, height = innerHeight, dpr = 1, count = 0, frame = 0, last = 0;
    let previousScroll = window.scrollY;
    let disposed = false;
    const current = scene.current;
    type Pipeline = { program: WebGLProgram; buffer: WebGLBuffer; position: number; style: number;
      resolution: WebGLUniformLocation | null; time: WebGLUniformLocation | null;
      scroll: WebGLUniformLocation | null; reading: WebGLUniformLocation | null;
      dpr: WebGLUniformLocation | null; velocity: WebGLUniformLocation | null };
    let material: Pipeline | undefined, field: Pipeline | undefined;
    let texture: WebGLTexture | null = null;
    const setup = (isField: boolean): Pipeline => {
      const program = createProgram(gl, isField ? particleVertex : vertex, isField ? particleFragment : fragment);
      const buffer = gl.createBuffer();
      if (!buffer) { gl.deleteProgram(program); throw new Error('Could not create background buffer'); }
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, isField ? particles : new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      return { program, buffer, position: gl.getAttribLocation(program, isField ? 'a_seed' : 'a_position'),
        style: isField ? gl.getAttribLocation(program, 'a_style') : -1,
        resolution: gl.getUniformLocation(program, 'u_resolution'), time: gl.getUniformLocation(program, 'u_time'),
        scroll: gl.getUniformLocation(program, 'u_scroll'), reading: gl.getUniformLocation(program, 'u_reading'),
        dpr: gl.getUniformLocation(program, 'u_dpr'), velocity: gl.getUniformLocation(program, 'u_velocity') };
    };
    const release = () => {
      for (const pipeline of [material, field]) {
        if (pipeline) { gl.deleteBuffer(pipeline.buffer); gl.deleteProgram(pipeline.program); }
      }
      if (texture) gl.deleteTexture(texture);
      texture = null; material = field = undefined;
    };
    const initialize = () => {
      try {
        material = setup(false); field = setup(true);
        texture = gl.createTexture();
        if (!texture) throw new Error('Could not create background texture');
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, grain);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.useProgram(material.program);
        gl.uniform1i(gl.getUniformLocation(material.program, 'u_grain'), 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        setAvailable(true);
      } catch {
        release(); setAvailable(false);
      }
    };
    const draw = (now: number) => {
      if (disposed || !material || !field || gl.isContextLost()) return;
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
      for (const pipeline of [material, field]) {
        const isField = pipeline === field;
        gl.useProgram(pipeline.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, pipeline.buffer);
        gl.enableVertexAttribArray(pipeline.position);
        gl.vertexAttribPointer(pipeline.position, isField ? 4 : 2, gl.FLOAT, false, isField ? 24 : 0, 0);
        if (isField) {
          gl.enableVertexAttribArray(pipeline.style);
          gl.vertexAttribPointer(pipeline.style, 2, gl.FLOAT, false, 24, 16);
        }
        gl.uniform2f(pipeline.resolution, width, height);
        gl.uniform1f(pipeline.time, reduced.matches ? 0 : current.time);
        gl.uniform1f(pipeline.scroll, reduced.matches ? 0 : current.scroll);
        // Readability follows the page even when the decorative motion is paused.
        gl.uniform1f(pipeline.reading, still ? Math.max(0, window.scrollY / height) : current.scroll);
        gl.uniform1f(pipeline.dpr, dpr);
        gl.uniform1f(pipeline.velocity, reduced.matches ? 0 : current.velocity);
        gl.drawArrays(isField ? gl.POINTS : gl.TRIANGLES, 0, isField ? count : 3);
        gl.disableVertexAttribArray(pipeline.position);
        if (isField) gl.disableVertexAttribArray(pipeline.style);
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
      // Retain crisp grain while bounding fragment cost on large Retina displays.
      dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2800000 / (width * height)));
      count = Math.min(MAX_PARTICLES, Math.max(18000, Math.round(width * height * .075)));
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      restart();
    };
    const onScroll = () => { if (paused || reduced.matches) restart(); };
    const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setAvailable(false); };
    const restored = () => { initialize(); resize(); };
    initialize(); resize();
    const sizing = new ResizeObserver(resize); sizing.observe(canvas);
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', restart);
    reduced.addEventListener('change', restart);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame); sizing.disconnect(); release();
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', restart);
      reduced.removeEventListener('change', restart);
    };
  }, [paused]);

  return <>
    <canvas className="particle-background" ref={canvasRef} aria-hidden="true" style={available ? undefined : { visibility: 'hidden' }} />
    {available && <button className="motion-control" aria-label={paused ? 'Play background animation' : 'Pause background animation'} title={paused ? 'Play background animation' : 'Pause background animation'} onClick={() => setPaused(value => !value)} aria-pressed={paused}>
      <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>
    </button>}
  </>;
}
