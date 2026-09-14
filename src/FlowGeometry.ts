type Vec3 = [number, number, number];

export type FlowSurfaceSample = { position: Vec3; normal: Vec3 };
const TAU = Math.PI * 2;
const BEND = Math.hypot(.36, -.10);
const EXTENSION_RELAXATION = .25;
// C lies in a plane. Parallel transport is therefore an exact rotation about
// this fixed binormal, with no Frenet-frame flips near the rounded cap.
const AXIS: Vec3 = [.10 / BEND, .36 / BEND, 0];

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function rotateFrame(v: Vec3, cosine: number, sine: number): Vec3 {
  const crossed = cross(AXIS, v);
  const dot = AXIS[0] * v[0] + AXIS[1] * v[1];
  return [
    v[0] * cosine + crossed[0] * sine + AXIS[0] * dot * (1 - cosine),
    v[1] * cosine + crossed[1] * sine + AXIS[1] * dot * (1 - cosine),
    v[2] * cosine + crossed[2] * sine,
  ];
}

/** Evaluate the approved surface. theta is in radians; u=0 is the closed throat. */
export function flowSurface(u: number, theta: number): FlowSurfaceSample {
  const coordinate = Math.max(0, u);
  const q = Math.sqrt(coordinate);
  const extension = Math.max(0, coordinate - 1);
  const relaxation = Math.exp(-extension / EXTENSION_RELAXATION);
  const frameU = coordinate <= 1 ? coordinate : 1 + EXTENSION_RELAXATION * (1 - relaxation);
  const frameDerivative = coordinate <= 1 ? 1 : relaxation;
  const turn = Math.atan2(BEND * frameU, .75);
  const cosine = Math.cos(turn), sine = Math.sin(turn);
  const normalFrame = rotateFrame([1, 0, 0], cosine, sine);
  const binormalFrame = rotateFrame([0, 1, 0], cosine, sine);
  const c = Math.cos(theta), s = Math.sin(theta);
  const radial: Vec3 = [
    c * normalFrame[0] + s * binormalFrame[0],
    c * normalFrame[1] + s * binormalFrame[1],
    c * normalFrame[2] + s * binormalFrame[2],
  ];
  const around: Vec3 = [
    -s * normalFrame[0] + c * binormalFrame[0],
    -s * normalFrame[1] + c * binormalFrame[1],
    -s * normalFrame[2] + c * binormalFrame[2],
  ];

  let center: Vec3;
  let radius: number;
  let radiusQ: number;
  if (coordinate <= 1) {
    center = [.18 * coordinate * coordinate, -.05 * coordinate * coordinate, .75 * coordinate];
    radius = .60 * q + .60 * coordinate * coordinate * coordinate;
    radiusQ = .60 + 3.60 * q ** 5;
  } else {
    // Relax curvature continuously rather than freezing the frame at u=1.
    // Both C' and C'' match the approved body at the start of the broad skirt.
    const bendExtension = EXTENSION_RELAXATION * (extension - EXTENSION_RELAXATION * (1 - relaxation));
    center = [
      .18 + .36 * (extension + bendExtension),
      -.05 - .10 * (extension + bendExtension),
      .75 + .75 * extension,
    ];
    radius = 1.20 + 2.10 * extension;
    radiusQ = 4.20 * q;
  }

  const position: Vec3 = [
    center[0] + radius * radial[0],
    center[1] + radius * radial[1],
    center[2] + radius * radial[2],
  ];

  // Differentiate with respect to q=sqrt(u), not u. The cap's tangent stays
  // finite: at q=0 its radial derivative is .6 and its normal is exactly +Z.
  const frameTurnQ = 2 * q * BEND * .75 * frameDerivative / (.75 * .75 + BEND * BEND * frameU * frameU);
  const radialTurn = cross(AXIS, radial);
  const along: Vec3 = [
    2 * q * .36 * frameU + radiusQ * radial[0] + radius * frameTurnQ * radialTurn[0],
    2 * q * -.10 * frameU + radiusQ * radial[1] + radius * frameTurnQ * radialTurn[1],
    2 * q * .75 + radiusQ * radial[2] + radius * frameTurnQ * radialTurn[2],
  ];
  // around is S_theta/r, removing the zero radius at the pole before taking
  // the cross product. Orientation points into the funnel and up at its cap.
  const perpendicular = cross(along, around);
  const magnitude = Math.hypot(...perpendicular);
  const normal: Vec3 = magnitude > 1e-12
    ? [perpendicular[0] / magnitude, perpendicular[1] / magnitude, perpendicular[2] / magnitude]
    : [0, 0, 1];
  return { position, normal };
}

/** The same surface for highp vertex shaders; no uniforms or textures required. */
export const FLOW_SURFACE_GLSL = `
const float FLOW_BEND = ${BEND.toPrecision(17)};
const float FLOW_RELAXATION = ${EXTENSION_RELAXATION.toPrecision(17)};
const vec3 FLOW_TRANSPORT_AXIS = vec3(${AXIS[0].toPrecision(17)}, ${AXIS[1].toPrecision(17)}, 0.0);

vec3 flowRotateFrame(vec3 v, float cosine, float sine) {
  return v * cosine + cross(FLOW_TRANSPORT_AXIS, v) * sine
    + FLOW_TRANSPORT_AXIS * dot(FLOW_TRANSPORT_AXIS, v) * (1.0 - cosine);
}

void flowSurface(float u, float theta, out vec3 position, out vec3 normal) {
  float coordinate = max(u, 0.0);
  float q = sqrt(coordinate);
  float extension = max(coordinate - 1.0, 0.0);
  float relaxation = exp(-extension / FLOW_RELAXATION);
  float frameU = coordinate <= 1.0 ? coordinate : 1.0 + FLOW_RELAXATION * (1.0 - relaxation);
  float frameDerivative = coordinate <= 1.0 ? 1.0 : relaxation;
  float frameLength2 = .75 * .75 + FLOW_BEND * FLOW_BEND * frameU * frameU;
  float inverseFrameLength = inversesqrt(frameLength2);
  // sin/cos(atan2(BEND * frameU, .75)) without three transcendental calls.
  float cosine = .75 * inverseFrameLength;
  float sine = FLOW_BEND * frameU * inverseFrameLength;
  float c = cos(theta), s = sin(theta);
  vec3 radial = flowRotateFrame(vec3(c, s, 0.0), cosine, sine);
  vec3 around = flowRotateFrame(vec3(-s, c, 0.0), cosine, sine);

  vec3 center;
  float radius;
  float radiusQ;
  if (coordinate <= 1.0) {
    float u2 = coordinate * coordinate;
    center = vec3(.18 * u2, -.05 * u2, .75 * coordinate);
    radius = .60 * q + .60 * u2 * coordinate;
    radiusQ = .60 + 3.60 * q * u2;
  } else {
    float bendExtension = FLOW_RELAXATION * (extension - FLOW_RELAXATION * (1.0 - relaxation));
    center = vec3(.18 + .36 * (extension + bendExtension),
      -.05 - .10 * (extension + bendExtension), .75 + .75 * extension);
    radius = 1.20 + 2.10 * extension;
    radiusQ = 4.20 * q;
  }
  position = center + radius * radial;

  // q derivatives remain finite at the cap, where cross(along, around) is +Z.
  float frameTurnQ = 2.0 * q * FLOW_BEND * .75 * frameDerivative / frameLength2;
  vec3 along = 2.0 * q * vec3(.36 * frameU, -.10 * frameU, .75)
    + radiusQ * radial + radius * frameTurnQ * cross(FLOW_TRANSPORT_AXIS, radial);
  vec3 perpendicular = cross(along, around);
  float magnitude = length(perpendicular);
  normal = magnitude > 1e-12 ? perpendicular / magnitude : vec3(0.0, 0.0, 1.0);
}
`;

/**
 * Surface u values at equally spaced mean meridian arc lengths.
 * For smooth interpolation at the rounded cap, interpolate sqrt(u), then square.
 */
export function createFlowArcMap(samples = 64, maxU = 2.6): { values: Float32Array; maxArc: number } {
  if (!Number.isInteger(samples) || samples < 2) throw new RangeError('The flow arc map needs at least two samples');
  if (!Number.isFinite(maxU) || maxU <= 0) throw new RangeError('The maximum surface coordinate must be finite and positive');
  const integrationSteps = 1024;
  const meridians = 16;
  const maxQ = Math.sqrt(maxU);
  const previous = new Float64Array(meridians * 3);
  const arc = new Float64Array(integrationSteps + 1);

  for (let step = 1; step <= integrationSteps; step++) {
    const q = step / integrationSteps * maxQ;
    let averageDistance = 0;
    for (let meridian = 0; meridian < meridians; meridian++) {
      const { position } = flowSurface(q * q, meridian / meridians * TAU);
      const offset = meridian * 3;
      averageDistance += Math.hypot(
        position[0] - previous[offset],
        position[1] - previous[offset + 1],
        position[2] - previous[offset + 2],
      ) / meridians;
      previous.set(position, offset);
    }
    arc[step] = arc[step - 1] + averageDistance;
  }

  const maxArc = arc[integrationSteps];
  const values = new Float32Array(samples);
  let segment = 1;
  for (let i = 1; i < samples - 1; i++) {
    const distance = i / (samples - 1) * maxArc;
    while (segment < integrationSteps && arc[segment] < distance) segment++;
    const blend = (distance - arc[segment - 1]) / (arc[segment] - arc[segment - 1]);
    const q = (segment - 1 + blend) / integrationSteps * maxQ;
    values[i] = q * q;
  }
  values[samples - 1] = maxU;
  return { values, maxArc };
}
