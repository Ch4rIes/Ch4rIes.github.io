import { FLOW_SURFACE_GLSL, createFlowArcMap } from './FlowGeometry';

const LIGHT_AIM = [-.62, -.52, .59] as const;

const MAX_PARTICLES = 300000;
const particleVertex = `
precision highp float;
attribute vec4 a_seed;
attribute vec2 a_style;
uniform vec2 u_resolution;
uniform float u_scroll, u_time, u_dpr, u_maxArc;
uniform float u_arcMap[64];
uniform vec3 u_lightAim;
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
  return vec2(.53, .75) * u_resolution + offset * vec2(1.0, -1.0);
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
  float thickness = .018 + .055 * smoothstep(.02, 1.5, arc);
  p += normal * a_seed.z * thickness;
}
void main() {
  float life = fract(a_seed.y - u_time * .010);
  vec3 p, normal, tail, tailNormal;
  particle(life, p, normal);
  particle(life + .0005, tail, tailNormal);
  vec2 screen = screenPosition(p);
  vec2 tangent = screen - screenPosition(tail);
  v_direction = tangent / max(length(tangent), .0001);
  float arc = life * u_maxArc;
  v_length = .15 + 5.5 * smoothstep(.12, 2.2, arc) * a_style.x;
  v_width = .28 + a_style.y * .15;
  v_box = v_length + 2.5;

  vec3 toLight = vec3(0.0, 0.0, .075) - p;
  float distance2 = dot(toLight, toLight);
  vec3 lightDirection = toLight * inversesqrt(max(distance2, .00001));
  float cone = smoothstep(.30, .90, dot(-lightDirection, normalize(u_lightAim)));
  float facing = max(dot(normal, lightDirection), 0.0);
  v_light = 1.0 - exp(-3.4 * facing * cone / (.10 + distance2));
  float tilt = .96 + atan(u_scroll * .22) * .04;
  vec3 eye = vec3(0.0, -sin(tilt), cos(tilt)) * 14.0;
  float grazing = abs(dot(normal, normalize(eye - p)));
  float density = .08 + .92 * smoothstep(.015, .55, grazing);
  density = mix(density, .55 + .45 * density, v_light);
  float fade = smoothstep(0.0, .008, life) * (1.0 - smoothstep(.90, 1.0, life));
  v_alpha = (.20 + .70 * v_light) * a_seed.w * density * fade;
  vec3 c = camera(p);
  float w = 14.0 - c.z;
  vec2 clip = vec2(screen.x / u_resolution.x * 2.0 - 1.0, 1.0 - screen.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip * w, (40.1 / 39.9) * w - 8.0 / 39.9, w);
  gl_PointSize = v_box * u_dpr;
}`;

const particleFragment = `
precision mediump float;
varying mediump vec2 v_direction;
varying mediump float v_length, v_box, v_width, v_alpha, v_light;
void main() {
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
uniform float u_extract;
vec3 sampleLight(vec2 uv) {
  vec3 color = texture2D(u_source, uv).rgb;
  float luminance = dot(color, vec3(.2126, .7152, .0722));
  return color * mix(1.0, smoothstep(.48, .76, luminance), u_extract);
}
void main() {
  // An elongated kernel keeps the softness aligned with the lit fold.
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
  color += texture2D(u_bloom, v_uv).rgb * .38;
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
      aim: uniform(field, 'u_lightAim'), dpr: uniform(field, 'u_dpr'), arcMap: uniform(field, 'u_arcMap[0]'), maxArc: uniform(field, 'u_maxArc') };
    const blurLocations = { position: gl.getAttribLocation(blur, 'a_position'), source: uniform(blur, 'u_source'), step: uniform(blur, 'u_step'), extract: uniform(blur, 'u_extract') };
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
      if (targets.length === 3 && nextWidth === pixelWidth && nextHeight === pixelHeight) return;
      pixelWidth = nextWidth; pixelHeight = nextHeight;
      releaseTargets();
      target(pixelWidth, pixelHeight);
      target(Math.max(1, Math.round(pixelWidth / 3)), Math.max(1, Math.round(pixelHeight / 3)));
      target(Math.max(1, Math.round(pixelWidth / 3)), Math.max(1, Math.round(pixelHeight / 3)));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    const textureUnit = (unit: number, texture: WebGLTexture) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); };
    const bindQuad = (location: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    };
    const draw = ({ time, scroll, reading }: FlowState) => {
      if (targets.length !== 3) return;
      const [scene, first, second] = targets;
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer); gl.viewport(0, 0, scene.width, scene.height);
      gl.clearColor(.32, .302, .276, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(field); gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.enableVertexAttribArray(fieldLocations.seed); gl.vertexAttribPointer(fieldLocations.seed, 4, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(fieldLocations.style); gl.vertexAttribPointer(fieldLocations.style, 2, gl.FLOAT, false, 24, 16);
      gl.uniform3f(fieldLocations.aim, ...LIGHT_AIM);
      gl.uniform2f(fieldLocations.resolution, width, height); gl.uniform1f(fieldLocations.scroll, scroll); gl.uniform1f(fieldLocations.time, time);
      gl.uniform1f(fieldLocations.dpr, dpr);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.disableVertexAttribArray(fieldLocations.seed); gl.disableVertexAttribArray(fieldLocations.style);
      gl.disable(gl.BLEND);
      gl.useProgram(blur); bindQuad(blurLocations.position); gl.uniform1i(blurLocations.source, 0);
      // Projected direction of the lit, left-hand fold; much softer along it
      // than across it. Only radiance from that fold enters these blur passes.
      const radius = Math.min(width, height) * .020;
      const tilt = .96 + Math.atan(scroll * .22) * .04;
      const roll = -.12 + Math.sin(scroll * .20) * .025;
      const y = LIGHT_AIM[1] * Math.cos(tilt) + LIGHT_AIM[2] * Math.sin(tilt);
      const dx = LIGHT_AIM[0] * Math.cos(roll) - y * Math.sin(roll);
      const dy = LIGHT_AIM[0] * Math.sin(roll) + y * Math.cos(roll);
      const magnitude = Math.max(.001, Math.hypot(dx, dy));
      const direction = [dx / magnitude, dy / magnitude];
      gl.bindFramebuffer(gl.FRAMEBUFFER, first.framebuffer); gl.viewport(0, 0, first.width, first.height);
      textureUnit(0, scene.texture); gl.uniform1f(blurLocations.extract, 1);
      gl.uniform2f(blurLocations.step, direction[0] * radius / width, direction[1] * radius / height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, second.framebuffer); gl.viewport(0, 0, second.width, second.height);
      textureUnit(0, first.texture); gl.uniform1f(blurLocations.extract, 0);
      gl.uniform2f(blurLocations.step, -direction[1] * radius * .24 / width, direction[0] * radius * .24 / height);
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
