/**
 * Shared GLSL source chunks and the tiny preprocessor that splices them in.
 *
 * Shaders pull these in with `#pragma include(NAME)`. A `#pragma` was chosen
 * over a custom `//#include` comment because it is valid GLSL: editors keep
 * syntax highlighting, and a shader that reaches a compiler without going
 * through `buildShaderSource` fails on the missing function rather than on a
 * mangled line.
 */

/** Names a shader may reference via `#pragma include(...)`. */
export type GlslChunkName =
    "HASH" | "SNOISE" | "OKLAB_TO_SRGB" | "FBM2" | "RAMP5";

/**
 * Cheap 2D value hash. Used for dithering the 8-bit velocity field and for film
 * grain, never for anything whose spatial structure matters: the output is
 * white noise with no gradient, which is exactly wrong for displacement and
 * exactly right for breaking up quantisation.
 */
export const HASH = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/**
 * 2D simplex noise, the standard Ashima / Gustavson formulation.
 *
 * Simplex rather than a hash lattice because every organic term in these
 * shaders differentiates the noise implicitly by sampling it at nearby points.
 * Lattice noise has axis-aligned creases that show up as a faint grid once the
 * band width breathes; simplex does not.
 *
 * Range is roughly -1..1.
 */
export const SNOISE = /* glsl */ `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

/**
 * Two-octave fBm plus the rotate-and-scale matrix that decorrelates the octaves.
 *
 * Two octaves is deliberate and should not be raised casually. These shaders get
 * their apparent detail from *domain warping* (feeding fBm back into itself
 * twice), which is far cheaper per unit of visual complexity than stacking
 * octaves, and which produces the curling, smoke-like structure that stacked
 * octaves cannot.
 *
 * The 1.5 scale on the rotation is the lacunarity; the rotation angle (about
 * 32 degrees) stops successive octaves from lining up into visible ridges.
 */
export const FBM2 = /* glsl */ `
const mat2 FBM_ROT = mat2(0.848, 0.53, -0.53, 0.848) * 1.5;

float fbm2(vec2 p) {
  float sum = 0.5 * snoise(p);
  p = FBM_ROT * p + vec2(3.1, 7.3);
  return (sum + 0.25 * snoise(p)) / 0.75;
}

float fbm3(vec2 p) {
  float sum = 0.5 * snoise(p);
  p = FBM_ROT * p + vec2(3.1, 7.3);
  sum += 0.25 * snoise(p);
  p = FBM_ROT * p + vec2(3.1, 7.3);
  return (sum + 0.125 * snoise(p)) / 0.875;
}
`;

/**
 * OKLab to sRGB, with the correct piecewise transfer curve.
 *
 * Everything upstream of this function works in OKLab, and this is the single
 * place a colour becomes displayable. That is the whole reason the ramps stay
 * clean: interpolating a dark brand hue toward near-white in sRGB passes through
 * a desaturated grey midpoint, while in OKLab it holds its chroma the whole way.
 *
 * The transfer is the real sRGB piecewise function, not pow(x, 1/2.2). The
 * approximation is visibly wrong in the near-black end, which is most of the
 * frame in a dark hero panel.
 */
export const OKLAB_TO_SRGB = /* glsl */ `
vec3 oklabToSrgb(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  vec3 lms = vec3(l_ * l_ * l_, m_ * m_ * m_, s_ * s_ * s_);
  vec3 linearRgb = vec3(
     4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z);
  linearRgb = clamp(linearRgb, 0.0, 1.0);
  return mix(12.92 * linearRgb,
             1.055 * pow(linearRgb, vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, linearRgb));
}
`;

/**
 * Five-stop colour ramp, chained with smoothstep rather than mix.
 *
 * smoothstep between adjacent stops means the ramp has a continuous first
 * derivative at each stop. A chain of linear mixes has a visible kink there,
 * which on a large soft gradient reads as a banding edge.
 *
 * `RAMP_STOPS` is a const array so it costs nothing at runtime. Making the stop
 * positions art-directable is a one-line change: delete the const and declare
 * `uniform float RAMP_STOPS[5];` instead. Uneven positions are how you bias a
 * palette, e.g. pushing stop 3 to 0.9 keeps the hot colour rare.
 *
 * Colours are taken as five separate parameters, not as an array, because
 * passing a uniform array straight into an array parameter is not reliably
 * supported across WebGL2 drivers.
 */
export const RAMP5 = /* glsl */ `
const float RAMP_STOPS[5] = float[5](0.0, 0.20, 0.50, 0.78, 1.0);

vec3 ramp5(vec3 s0, vec3 s1, vec3 s2, vec3 s3, vec3 s4, float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = s0;
  c = mix(c, s1, smoothstep(RAMP_STOPS[0], RAMP_STOPS[1], t));
  c = mix(c, s2, smoothstep(RAMP_STOPS[1], RAMP_STOPS[2], t));
  c = mix(c, s3, smoothstep(RAMP_STOPS[2], RAMP_STOPS[3], t));
  c = mix(c, s4, smoothstep(RAMP_STOPS[3], RAMP_STOPS[4], t));
  return c;
}
`;

const CHUNKS: Readonly<Record<GlslChunkName, string>> = {
    HASH,
    SNOISE,
    OKLAB_TO_SRGB,
    FBM2,
    RAMP5,
};

/**
 * Chunks that only compile once another chunk is present. Resolved
 * automatically so a shader can ask for FBM2 without also remembering SNOISE.
 */
const CHUNK_DEPENDENCIES: Readonly<
    Partial<Record<GlslChunkName, GlslChunkName[]>>
> = {
    FBM2: ["SNOISE"],
};

const INCLUDE_PATTERN =
    /^[ \t]*#pragma[ \t]+include\([ \t]*([A-Z0-9_]+)[ \t]*\)[ \t]*$/gm;

function isChunkName(name: string): name is GlslChunkName {
    return Object.prototype.hasOwnProperty.call(CHUNKS, name);
}

function collectChunk(
    name: GlslChunkName,
    emitted: Set<GlslChunkName>
): string {
    if (emitted.has(name)) return "";
    emitted.add(name);
    const dependencies = CHUNK_DEPENDENCIES[name] ?? [];
    const prelude = dependencies
        .map((dependency) => collectChunk(dependency, emitted))
        .join("");
    return prelude + CHUNKS[name];
}

/**
 * Replaces every `#pragma include(NAME)` with its chunk, pulling in
 * dependencies and emitting each chunk at most once.
 *
 * @throws if a shader names a chunk that does not exist, which is otherwise a
 *   silent "undeclared identifier" from the driver a hundred lines later.
 */
export function resolveIncludes(source: string): string {
    const emitted = new Set<GlslChunkName>();
    return source.replace(INCLUDE_PATTERN, (_match, rawName: string) => {
        if (!isChunkName(rawName)) {
            throw new Error(
                `Unknown GLSL chunk "${rawName}". Known chunks: ${Object.keys(CHUNKS).join(", ")}.`
            );
        }
        return collectChunk(rawName, emitted);
    });
}

/** Values a shader `#define` may take. Numbers are formatted for GLSL. */
export type ShaderDefines = Readonly<Record<string, number | string | boolean>>;

/**
 * Formats a define value as a GLSL literal.
 *
 * Integers stay integers. This matters: an array size must be a constant
 * *integer* expression, so emitting `10.0` for a slot count makes
 * `uniform vec4 u_pulses[PULSE_SLOTS];` fail to compile. GLSL ES 3.00 does
 * implicitly convert int to float in arithmetic, so an integer define is still
 * safe in a float expression.
 *
 * Pass a **string** when you need a specific literal form and do not want to
 * rely on that implicit conversion, e.g. `{ MAX_VELOCITY: "2.0" }`.
 */
function formatDefineValue(value: number | string | boolean): string {
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "1" : "0";
    if (!Number.isFinite(value))
        throw new Error(`Cannot define a non-finite value: ${value}`);
    return `${value}`;
}

/**
 * Assembles a compilable shader: version line, then defines, then includes.
 *
 * The `#version` directive must be the first non-comment line in the file, so
 * defines cannot simply be prepended; they are spliced in immediately after it.
 */
export function buildShaderSource(
    source: string,
    defines: ShaderDefines = {}
): string {
    const resolved = resolveIncludes(source);
    const entries = Object.entries(defines);
    if (entries.length === 0) return resolved;

    const block = entries
        .map(([name, value]) => `#define ${name} ${formatDefineValue(value)}`)
        .join("\n");

    const versionMatch = resolved.match(/^[ \t]*#version[^\n]*\n/);
    if (!versionMatch) return `${block}\n${resolved}`;

    const insertAt = versionMatch[0].length;
    return `${resolved.slice(0, insertAt)}${block}\n${resolved.slice(insertAt)}`;
}
