import { createMaterialGrains } from './MaterialGrains';

// A continuous reflection and fine moving material, evaluated independently.
// Texture never controls the silhouette, density, or location of the light.
const vertexSource = `
attribute vec2 a_position;
varying highp vec2 v_uv;
void main() {
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const lightingFunctions = `
vec2 rotate(vec2 p, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
vec3 displayRadiance(vec3 radiance) {
  float exposure = .70 / (1.0 + 1.8 * smoothstep(.15, .90, u_reading));
  vec3 exposed = radiance * exposure;
  vec3 mapped = exposed / (vec3(1.0) + exposed);
  return mix(12.92 * mapped, 1.055 * pow(mapped, vec3(1.0 / 2.4)) - .055,
    step(vec3(.0031308), mapped));
}
float lightArrival(vec2 direction) {
  if (u_entrance <= 0.0) return 0.0;
  if (u_entrance >= 1.0) return 1.0;
  // Unwrap about the left side of the existing off-screen ellipse. The light
  // travels around its shoulder from upper-left toward lower-right, never as
  // a screen-space wipe. A 24%-arc feather keeps the advancing light diffuse.
  float arc = clamp((.34 - atan(-direction.y, -direction.x)) / 1.90, 0.0, 1.0);
  float t = clamp(u_entrance, 0.0, 1.0);
  float eased = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  float frontier = mix(-.12, 1.12, eased);
  return 1.0 - smoothstep(frontier - .12, frontier + .12, arc);
}
vec3 reflectionRadiance(vec2 pixel) {
  float scale = min(u_resolution.x, u_resolution.y);
  float parallax = 1.0 - exp(-max(u_scroll, 0.0) * .35);
  vec2 center = vec2(1.13, .14) * u_resolution;
  center.y -= .045 * scale * parallax;
  // On tall phones the arc crops farther left, leaving the centered type clear.
  float horizontalRadius = mix(1.25, 1.00, smoothstep(.60, .80, u_resolution.x / u_resolution.y));
  vec2 axes = vec2(horizontalRadius, .68) * u_resolution;
  vec2 local = rotate(pixel - center, .12);
  vec2 ellipse = local / axes;
  float radius = length(ellipse);
  // Gradient-normalized ellipse distance. Its center is off-screen, but the
  // guard also prevents a singularity if the composition is changed later.
  float distanceToRidge = radius < .0001 ? -min(axes.x, axes.y)
    : (radius - 1.0) / length(ellipse / (radius * axes));
  vec2 direction = ellipse / max(radius, .0001);
  float alignment = dot(direction, normalize(vec2(-.86, .51)));
  float broad = .85 * exp(1.40 * (alignment - 1.0))
    * exp(-.5 * pow(distanceToRidge / (.145 * scale), 2.0));
  float ridge = 3.30 * exp(4.40 * (alignment - 1.0))
    * exp(-.5 * pow(distanceToRidge / (.032 * scale), 2.0));
  // Both lobes are positive, have the same centerline, and fall off smoothly.
  // There is no point source, negative ring, density mask, or occluding body.
  vec3 base = vec3(.20, .183, .151);
  return base + vec3(1.0, .90, .76) * (broad + ridge) * lightArrival(direction);
}
`;

const fragmentSource = `
precision highp float;
varying highp vec2 v_uv;
uniform sampler2D u_grain;
uniform vec2 u_resolution;
uniform float u_time, u_scroll, u_reading, u_entrance;

${lightingFunctions}
float grain(vec2 p) {
  return texture2D(u_grain, p / 256.0).r * 2.0 - 1.0;
}
void main() {
  vec2 pixel = vec2(v_uv.x, 1.0 - v_uv.y) * u_resolution;
  float scale = min(u_resolution.x, u_resolution.y);
  float parallax = 1.0 - exp(-max(u_scroll, 0.0) * .35);
  // A common slow translation and gentle shear move the material without
  // circular paths. Fibers are 2–4 CSS pixels, mixed with subpixel grain.
  vec2 material = pixel + vec2(u_time * 1.15, u_time * .32 + parallax * 18.0);
  material.x += scale * .035 * sin(material.y / scale * 2.2);
  vec2 brushed = rotate(material, -.38);
  float fibers = grain(brushed / vec2(3.8, .90));
  float fine = grain(material * .72 + vec2(61.7, 19.3));
  float variation = clamp(1.65 * (.52 * fibers + .48 * fine), -1.0, 1.0);
  vec3 color = displayRadiance(reflectionRadiance(pixel));
  // Bounded material contrast after exposure stays perceptible on the ridge.
  // It can vary the surface by at most 6.5%, never carve a dark patch into it.
  color *= 1.0 + .065 * variation;
  // Subtle stationary dither prevents 8-bit banding in the long soft falloff.
  color += grain(pixel * 1.71 + vec2(13.2, 47.8)) / 510.0;
  gl_FragColor = vec4(color, 1.0);
}`;

function compile(gl: WebGLRenderingContext) {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create material program');
  const shaders: WebGLShader[] = [];
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create material shader');
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || 'Material shader compilation failed');
      }
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Material shader linking failed');
    }
    return program;
  } catch (error) { gl.deleteProgram(program); throw error; }
  finally { shaders.forEach(shader => gl.deleteShader(shader)); }
}

export type FlowState = { time: number; scroll: number; reading: number; entrance: number };

export function createFlowRenderer(gl: WebGLRenderingContext) {
  let program: WebGLProgram | undefined;
  let grains: ReturnType<typeof createMaterialGrains> | undefined;
  let quad: WebGLBuffer | null = null, texture: WebGLTexture | null = null;
  let width = 1, height = 1, pixelWidth = 1, pixelHeight = 1, disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    grains?.dispose();
    if (program) gl.deleteProgram(program);
    if (quad) gl.deleteBuffer(quad);
    if (texture) gl.deleteTexture(texture);
  };
  try {
    program = compile(gl);
    grains = createMaterialGrains(gl, lightingFunctions);
    quad = gl.createBuffer(); texture = gl.createTexture();
    if (!quad || !texture) throw new Error('Could not allocate material resources');
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    // Deterministic local microtexture; uploaded once, never regenerated per frame.
    const data = new Uint8Array(256 * 256);
    let seed = 193;
    for (let i = 0; i < data.length; i++) {
      seed = seed * 16807 % 2147483647;
      data[i] = Math.floor((seed - 1) / 2147483646 * 256);
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 256, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const position = gl.getAttribLocation(program, 'a_position');
    const locations = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      grain: gl.getUniformLocation(program, 'u_grain'),
      time: gl.getUniformLocation(program, 'u_time'),
      scroll: gl.getUniformLocation(program, 'u_scroll'),
      reading: gl.getUniformLocation(program, 'u_reading'),
      entrance: gl.getUniformLocation(program, 'u_entrance'),
    };
    return {
      resize(w: number, h: number, ratio: number) {
        width = Math.max(1, w); height = Math.max(1, h);
        pixelWidth = Math.max(1, Math.round(width * ratio));
        pixelHeight = Math.max(1, Math.round(height * ratio));
        grains?.resize(width, height, ratio);
      },
      draw({ time, scroll, reading, entrance = 1 }: FlowState) {
        if (disposed || gl.isContextLost()) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, pixelWidth, pixelHeight);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
        gl.useProgram(program!);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(locations.resolution, width, height); gl.uniform1i(locations.grain, 0);
        gl.uniform1f(locations.time, time); gl.uniform1f(locations.scroll, scroll);
        gl.uniform1f(locations.reading, reading);
        gl.uniform1f(locations.entrance, entrance);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disableVertexAttribArray(position);
        grains?.draw({ time, scroll, reading, entrance });
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
