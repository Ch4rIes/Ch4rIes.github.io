import { FLOW_SURFACE_GLSL, createFlowArcMap } from './FlowGeometry';

const MAX_PARTICLES = 300000;
const particleVertex = `
precision highp float;
attribute vec4 a_seed;
attribute vec2 a_style;
uniform vec2 u_resolution;
uniform float u_scroll, u_time, u_dpr, u_maxArc;
uniform mediump float u_glowPass;
uniform float u_arcMap[64];
varying mediump vec2 v_direction;
varying mediump float v_length, v_box, v_width, v_alpha, v_light;
${FLOW_SURFACE_GLSL}
vec3 camera(vec3 p) {
  float tilt = .96 + atan(u_scroll * .22) * .04;
  float roll = -.12 + sin(u_scroll * .20) * .025;
  float y = p.y * cos(tilt) + p.z * sin(tilt);
  float depth = -p.y * sin(tilt) + p.z * cos(tilt);
  return vec3(p.x * cos(roll) - y * sin(roll), p.x * sin(roll) + y * cos(roll), depth);
}
float worldScale() {
  float compact = 1.0 - smoothstep(540.0, 760.0, u_resolution.x);
  return mix(min(u_resolution.x * .37, u_resolution.y * .52), u_resolution.x * .64, compact);
}
vec2 screenPosition(vec3 p) {
  vec3 c = camera(p);
  vec2 offset = c.xy * (14.0 / (14.0 - c.z)) * worldScale();
  float compact = 1.0 - smoothstep(540.0, 760.0, u_resolution.x);
  return vec2(mix(.45, .65, compact), .79) * u_resolution + offset * vec2(1.0, -1.0);
}
void particle(float life, out vec3 p, out vec3 normal) {
  float coordinate = clamp(life, 0.0, 1.0) * 63.0;
  int index = int(min(floor(coordinate), 62.0));
  float q = mix(sqrt(u_arcMap[index]), sqrt(u_arcMap[index + 1]), coordinate - float(index));
  float u = q * q;
  float arc = life * u_maxArc;
  float theta = a_seed.x + 1.45 * log(.18 + arc);
  flowSurface(u, theta, p, normal);
  // A thin, continuous volume softens the implied fold. The individual points
  // remain sharp; no opaque mesh or artificially blurred material is drawn.
  float thickness = .007 + .017 * smoothstep(.02, 1.5, arc);
  p += normal * a_seed.z * thickness;
}
void main() {
  float life = fract(a_seed.y - u_time * .010);
  vec3 p, normal, tail, tailNormal;
  particle(life, p, normal);
  vec2 screen = screenPosition(p);
  v_direction = vec2(1.0, 0.0);
  if (u_glowPass < .5) {
    particle(life + .0005, tail, tailNormal);
    vec2 tangent = screen - screenPosition(tail);
    v_direction = tangent / max(length(tangent), .0001);
  }
  float arc = life * u_maxArc;
  v_length = .15 + 3.8 * smoothstep(.12, 2.2, arc) * a_style.x;
  v_width = .28 + a_style.y * .15;
  v_box = v_length + 2.5;

  // The luminous crescent follows the SAME logarithmic streamlines as the
  // particles. Phase selects a broad family of paths, never a screen-space beam.
  float phase = a_seed.x - 3.55;
  phase = atan(sin(phase), cos(phase));
  float spread = .50 + .80 * exp(-arc / .35);
  float ribbon = exp(-.5 * phase * phase / (spread * spread));
  float shoulder = (.4 + arc / .75) * exp(-arc / .9) * 1.4;
  float wallLight = .95 * ribbon * shoulder;
  float coreLight = .94 * exp(-arc * arc / .016);
  v_light = 1.0 - (1.0 - wallLight) * (1.0 - coreLight);
  float tilt = .96 + atan(u_scroll * .22) * .04;
  vec3 eye = vec3(0.0, -sin(tilt), cos(tilt)) * 14.0;
  float facingView = dot(normal, normalize(eye - p));
  // Rear particles remain faintly visible, without competing tangent fields.
  float density = .12 + .88 * smoothstep(-.12, .55, facingView);
  // The illuminated ribbon is a volume of emissive particles, visible across
  // the near-side turn as well as the inner wall. Ambient rear grains stay dim.
  density = mix(density, 1.0, v_light * .85);
  density *= .40 + .60 * smoothstep(.015, .20, arc);
  float fade = smoothstep(0.0, .008, life) * (1.0 - smoothstep(.90, 1.0, life));
  v_alpha = (.075 + .68 * sqrt(v_light)) * a_seed.w * density * fade;
  vec3 c = camera(p);
  float w = 14.0 - c.z;
  vec2 clip = vec2(screen.x / u_resolution.x * 2.0 - 1.0, 1.0 - screen.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip * w, (40.1 / 39.9) * w - 8.0 / 39.9, w);
  gl_PointSize = mix(v_box, mix(36.0, 24.0, coreLight), u_glowPass) * u_dpr;
  if (u_glowPass > .5 && v_light < .02) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const particleFragment = `
precision mediump float;
uniform mediump float u_glowPass;
varying mediump vec2 v_direction;
varying mediump float v_length, v_box, v_width, v_alpha, v_light;
void main() {
  if (u_glowPass > .5) {
    // Light is accumulated from the very same particles, before diffusion.
    // The crisp particle pass is never blurred.
    vec2 q = (gl_PointCoord - .5) * 2.0;
    float radiance = exp(-dot(q, q) * 4.0) * v_alpha * pow(v_light, 1.2) * .04;
    gl_FragColor = vec4(vec3(.98, .92, .80) * radiance, 1.0);
    return;
  }
  vec2 p = (gl_PointCoord - .5) * v_box;
  float along = dot(p, v_direction);
  float across = dot(p, vec2(-v_direction.y, v_direction.x));
  float end = max(abs(along) - v_length * .5, 0.0);
  float distance = length(vec2(end, across));
  float ink = 1.0 - smoothstep(v_width - .12, v_width + .30, distance);
  float head = mix(.65, 1.0, smoothstep(-v_length * .5, v_length * .5 + .001, along));
  float alpha = ink * head * v_alpha;
  if (alpha < .003) discard;
  vec3 champagne = mix(vec3(.80, .747, .650), vec3(.98, .945, .854), v_light);
  gl_FragColor = vec4(champagne, alpha);
}`;

const quadVertex = `
attribute vec2 a_position;
varying highp vec2 v_uv;
void main() {
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
const blurFragment = `
precision highp float;
varying highp vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_step;
vec3 sampleLight(vec2 uv) {
  return texture2D(u_source, uv).rgb;
}
void main() {
  // Local diffusion only: the curved surface radiance already forms the light.
  vec3 color = sampleLight(v_uv) * .227027;
  color += sampleLight(v_uv + u_step * 1.384615) * .316216;
  color += sampleLight(v_uv - u_step * 1.384615) * .316216;
  color += sampleLight(v_uv + u_step * 3.230769) * .070270;
  color += sampleLight(v_uv - u_step * 3.230769) * .070270;
  gl_FragColor = vec4(color, 1.0);
}`;
const compositeFragment = `
precision highp float;
varying highp vec2 v_uv;
uniform sampler2D u_scene, u_bloom;
uniform float u_reading;
void main() {
  vec3 color = texture2D(u_scene, v_uv).rgb;
  // The bounded light field preserves variation without clipping its overlaps.
  vec3 radiance = texture2D(u_bloom, v_uv).rgb;
  color += (1.0 - color) * radiance * .95;
  float vignette = smoothstep(.35, .90, length((v_uv - .5) * vec2(.85, 1.0)));
  color *= 1.0 - .14 * vignette;
  float reading = smoothstep(.15, .9, u_reading);
  color /= 1.0 + color * (1.7 * reading);
  gl_FragColor = vec4(min(color, vec3(.97)), 1.0);
}`;

function compile(gl: WebGLRenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create flow program');
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create flow shader');
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Flow shader compilation failed');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Flow shader linking failed');
    return program;
  } catch (error) {
    gl.deleteProgram(program); throw error;
  } finally {
    shaders.forEach(shader => gl.deleteShader(shader));
  }
}

// Seeded particles share one continuous path family. Their thickness is spatial
// variation, not image blur; a wrapped lifespan fades gently at either end.
function createParticles() {
  const data = new Float32Array(MAX_PARTICLES * 6);
  let seed = 193;
  const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const offset = i * 6;
    data[offset] = random() * Math.PI * 2;
    data[offset + 1] = random();
    data[offset + 2] = Math.max(-2.3, Math.min(2.3, Math.sqrt(-2 * Math.log(Math.max(.0001, random()))) * Math.cos(random() * Math.PI * 2)));
    data[offset + 3] = .50 + random() * .50;
    data[offset + 4] = .72 + random() * .46;
    data[offset + 5] = random();
  }
  return data;
}
const particles = createParticles();
const arcMap = createFlowArcMap(64, 2.6);

type Target = { framebuffer: WebGLFramebuffer; texture: WebGLTexture; width: number; height: number };
export type FlowState = { time: number; scroll: number; reading: number };

export function createFlowRenderer(gl: WebGLRenderingContext) {
  const programs: WebGLProgram[] = [], buffers: WebGLBuffer[] = [];
  let targets: Target[] = [];
  let width = 1, height = 1, pixelWidth = 1, pixelHeight = 1, dpr = 1, count = 0;
  const releaseTargets = () => {
    targets.forEach(target => {
      gl.deleteFramebuffer(target.framebuffer); gl.deleteTexture(target.texture);
    });
    targets = [];
  };
  const dispose = () => {
    releaseTargets();
    programs.forEach(program => gl.deleteProgram(program));
    buffers.forEach(buffer => gl.deleteBuffer(buffer));
  };
  try {
    const program = (vertex: string, fragment: string) => {
      const result = compile(gl, vertex, fragment); programs.push(result); return result;
    };
    const field = program(particleVertex, particleFragment), blur = program(quadVertex, blurFragment), composite = program(quadVertex, compositeFragment);
    const uniform = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
    const fieldLocations = { seed: gl.getAttribLocation(field, 'a_seed'), style: gl.getAttribLocation(field, 'a_style'),
      resolution: uniform(field, 'u_resolution'), scroll: uniform(field, 'u_scroll'), time: uniform(field, 'u_time'),
      dpr: uniform(field, 'u_dpr'), glowPass: uniform(field, 'u_glowPass'), arcMap: uniform(field, 'u_arcMap[0]'), maxArc: uniform(field, 'u_maxArc') };
    const blurLocations = { position: gl.getAttribLocation(blur, 'a_position'), source: uniform(blur, 'u_source'), step: uniform(blur, 'u_step') };
    const compositeLocations = { position: gl.getAttribLocation(composite, 'a_position'), scene: uniform(composite, 'u_scene'), bloom: uniform(composite, 'u_bloom'), reading: uniform(composite, 'u_reading') };
    const buffer = (target: number, data: Float32Array) => {
      const result = gl.createBuffer(); if (!result) throw new Error('Could not allocate flow geometry');
      buffers.push(result); gl.bindBuffer(target, result); gl.bufferData(target, data, gl.STATIC_DRAW); return result;
    };
    const vertices = buffer(gl.ARRAY_BUFFER, particles);
    const quad = buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
    gl.useProgram(field); gl.uniform1fv(fieldLocations.arcMap, arcMap.values); gl.uniform1f(fieldLocations.maxArc, arcMap.maxArc);

    const target = (w: number, h: number): Target => {
      const framebuffer = gl.createFramebuffer(), texture = gl.createTexture();
      if (!framebuffer || !texture) {
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        if (texture) gl.deleteTexture(texture);
        throw new Error('Could not allocate flow render target');
      }
      const result = { framebuffer, texture, width: w, height: h };
      targets.push(result);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete flow render target');
      return result;
    };
    const resize = (w: number, h: number, ratio: number) => {
      width = w; height = h; dpr = ratio;
      count = Math.min(MAX_PARTICLES, Math.max(40000, Math.round(width * height * .22)));
      const nextWidth = Math.max(1, Math.round(width * dpr)), nextHeight = Math.max(1, Math.round(height * dpr));
      if (targets.length === 4 && nextWidth === pixelWidth && nextHeight === pixelHeight) return;
      pixelWidth = nextWidth; pixelHeight = nextHeight;
      releaseTargets();
      target(pixelWidth, pixelHeight);
      target(Math.max(1, Math.round(pixelWidth / 3)), Math.max(1, Math.round(pixelHeight / 3)));
      target(Math.max(1, Math.round(pixelWidth / 3)), Math.max(1, Math.round(pixelHeight / 3)));
      target(Math.max(1, Math.round(pixelWidth / 3)), Math.max(1, Math.round(pixelHeight / 3)));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    const textureUnit = (unit: number, texture: WebGLTexture) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); };
    const bindQuad = (location: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    };
    const draw = ({ time, scroll, reading }: FlowState) => {
      if (targets.length !== 4) return;
      const [scene, emission, first, second] = targets;
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer); gl.viewport(0, 0, scene.width, scene.height);
      gl.clearColor(.32, .302, .276, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(field); gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.enableVertexAttribArray(fieldLocations.seed); gl.vertexAttribPointer(fieldLocations.seed, 4, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(fieldLocations.style); gl.vertexAttribPointer(fieldLocations.style, 2, gl.FLOAT, false, 24, 16);
      gl.uniform2f(fieldLocations.resolution, width, height); gl.uniform1f(fieldLocations.scroll, scroll); gl.uniform1f(fieldLocations.time, time);
      gl.uniform1f(fieldLocations.dpr, dpr);
      gl.uniform1f(fieldLocations.glowPass, 0);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindFramebuffer(gl.FRAMEBUFFER, emission.framebuffer); gl.viewport(0, 0, emission.width, emission.height);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      // Screen accumulation models bounded transmission, avoiding RGBA8 clipping
      // before diffusion: light = 1 - product(1 - each particle contribution).
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      gl.uniform1f(fieldLocations.glowPass, 1);
      gl.uniform1f(fieldLocations.dpr, dpr / 3);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.disableVertexAttribArray(fieldLocations.seed); gl.disableVertexAttribArray(fieldLocations.style);
      gl.disable(gl.BLEND);
      gl.useProgram(blur); bindQuad(blurLocations.position); gl.uniform1i(blurLocations.source, 0);
      // Keep diffusion local; the shared surface ribbon supplies all direction.
      const radius = 4.0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, first.framebuffer); gl.viewport(0, 0, first.width, first.height);
      textureUnit(0, emission.texture);
      gl.uniform2f(blurLocations.step, radius / width, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, second.framebuffer); gl.viewport(0, 0, second.width, second.height);
      textureUnit(0, first.texture);
      gl.uniform2f(blurLocations.step, 0, radius / height);
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(blurLocations.position);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, pixelWidth, pixelHeight);
      gl.useProgram(composite); bindQuad(compositeLocations.position);
      textureUnit(0, scene.texture); textureUnit(1, second.texture);
      gl.uniform1i(compositeLocations.scene, 0); gl.uniform1i(compositeLocations.bloom, 1); gl.uniform1f(compositeLocations.reading, reading);
      gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disableVertexAttribArray(compositeLocations.position);
    };
    return { resize, draw, dispose };
  } catch (error) {
    dispose(); throw error;
  }
}
