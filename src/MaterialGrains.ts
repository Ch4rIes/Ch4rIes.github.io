const MAX_GRAINS = 18000;
const MARGIN = 16;
const GRAIN_SIZE = 1.8;

const vertexSource = `
precision highp float;
attribute vec4 a_seed;
attribute vec2 a_style;
uniform vec2 u_resolution;
uniform float u_time, u_scroll, u_dpr;
varying highp vec2 v_pixel, v_direction;
varying highp float v_length, v_radius, v_box, v_style;
void main() {
  vec2 span = u_resolution + ${MARGIN * 2}.0;
  float scale = max(1.0, min(u_resolution.x, u_resolution.y));
  float parallax = 1.0 - exp(-max(u_scroll, 0.0) * .35);
  float y = mod(a_seed.y * span.y - u_time * 2.5 - parallax * 18.0, span.y) - ${MARGIN}.0;
  // A translation with a smooth x shear preserves uniform spatial density.
  // Each grain follows the same field; there is no center, orbit or swarm.
  float shear = scale * .026 * sin(y / scale * 2.2);
  float x = mod(a_seed.x * span.x - u_time * 7.0 + shear, span.x) - ${MARGIN}.0;
  v_pixel = vec2(x, y);
  v_direction = normalize(vec2(-7.0 - .026 * 2.2 * 2.5 * cos(y / scale * 2.2), -2.5));
  v_length = a_style.x < .20 ? 0.0 : mix(1.5, 4.0, a_seed.z) * ${GRAIN_SIZE};
  v_radius = mix(.45, .70, a_seed.w) * .5 * ${GRAIN_SIZE};
  v_box = v_length + 2.0 * v_radius + 1.5;
  v_style = mix(.65, 1.0, a_style.y);
  vec2 clip = vec2(x / u_resolution.x * 2.0 - 1.0, 1.0 - y / u_resolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = v_box * u_dpr;
}`;

function fragmentSource(lightingFunctions: string) {
  return `
precision highp float;
uniform vec2 u_resolution;
uniform float u_scroll, u_reading, u_dpr, u_entrance;
varying highp vec2 v_pixel, v_direction;
varying highp float v_length, v_radius, v_box, v_style;
${lightingFunctions}
void main() {
  // Point coordinates and reflectionRadiance both use top-down CSS pixels.
  vec2 local = (gl_PointCoord - .5) * v_box;
  float along = dot(local, v_direction);
  float across = dot(local, vec2(-v_direction.y, v_direction.x));
  float end = max(abs(along) - v_length * .5, 0.0);
  float distance = length(vec2(end, across));
  float coverage = clamp(.5 + (v_radius - distance) / max(.45 / u_dpr, .12), 0.0, 1.0);
  if (coverage <= .001) discard;
  // These grains receive the exact same reflection as the broad material.
  // Their restrained, positive contribution cannot cut a dark patch into it.
  vec3 light = displayRadiance(reflectionRadiance(v_pixel));
  vec3 glint = min(vec3(.045, .041, .035) + .085 * light, (vec3(.985) - light) * .48);
  float wake = smoothstep(.12, .70, clamp(u_entrance, 0.0, 1.0));
  vec3 color = glint * coverage * v_style * wake;
  gl_FragColor = vec4(color, 0.0);
}`;
}

function createSeeds() {
  const seeds = new Float32Array(MAX_GRAINS * 6);
  let state = 827;
  const random = () => {
    state = state * 16807 % 2147483647;
    return (state - 1) / 2147483646;
  };
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  return seeds;
}
const seeds = createSeeds();

function compile(gl: WebGLRenderingContext, lightingFunctions: string) {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create material grain program');
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource(lightingFunctions)]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create material grain shader');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Material grain shader compilation failed');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Material grain shader linking failed');
    return program;
  } catch (error) { gl.deleteProgram(program); throw error; }
  finally { shaders.forEach(shader => gl.deleteShader(shader)); }
}

/**
 * An additive overlay for the reflection material. lightingFunctions supplies
 * reflectionRadiance(topDownCssPixel) and displayRadiance(linearRadiance), using
 * the u_resolution, u_scroll, u_reading and u_entrance uniforms declared here.
 */
export function createMaterialGrains(gl: WebGLRenderingContext, lightingFunctions: string) {
  let program: WebGLProgram | undefined, buffer: WebGLBuffer | null = null;
  let width = 1, height = 1, pixelWidth = 1, pixelHeight = 1, dpr = 1, count = 0, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (program) gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
  };
  try {
    program = compile(gl, lightingFunctions);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error('Could not allocate material grains');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    const seed = gl.getAttribLocation(program, 'a_seed'), style = gl.getAttribLocation(program, 'a_style');
    const uniforms = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      time: gl.getUniformLocation(program, 'u_time'),
      scroll: gl.getUniformLocation(program, 'u_scroll'),
      reading: gl.getUniformLocation(program, 'u_reading'),
      dpr: gl.getUniformLocation(program, 'u_dpr'),
      entrance: gl.getUniformLocation(program, 'u_entrance'),
    };
    return {
      resize(w: number, h: number, ratio: number) {
        if (disposed) return;
        width = Math.max(1, w); height = Math.max(1, h); dpr = Math.max(.1, ratio);
        pixelWidth = Math.max(1, Math.round(width * dpr)); pixelHeight = Math.max(1, Math.round(height * dpr));
        count = Math.min(MAX_GRAINS, Math.ceil((width + MARGIN * 2) * (height + MARGIN * 2) / 70));
      },
      draw({ time, scroll, reading, entrance = 1 }: { time: number; scroll: number; reading: number; entrance: number }) {
        if (disposed || !count || gl.isContextLost()) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, pixelWidth, pixelHeight);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(program!); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(seed); gl.vertexAttribPointer(seed, 4, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(style); gl.vertexAttribPointer(style, 2, gl.FLOAT, false, 24, 16);
        gl.uniform2f(uniforms.resolution, width, height); gl.uniform1f(uniforms.dpr, dpr);
        gl.uniform1f(uniforms.time, time); gl.uniform1f(uniforms.scroll, scroll); gl.uniform1f(uniforms.reading, reading);
        gl.uniform1f(uniforms.entrance, entrance);
        gl.drawArrays(gl.POINTS, 0, count);
        gl.disableVertexAttribArray(seed); gl.disableVertexAttribArray(style); gl.disable(gl.BLEND);
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
