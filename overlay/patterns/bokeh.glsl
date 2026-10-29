// @render-scale 0.5
// @max-dpr 1
// @grain 1
// @thumb-zoom 6

// One disc per cell, kept inside its cell so no neighbour lookups are needed.
vec2 bokeh(vec2 q, float size, float rise, float seed, float blur, float density, float t) {
  vec2 g = (q - vec2(0.0, t * rise)) / size + seed * 13.7;
  vec2 cell = floor(g);
  vec2 f = g - cell - 0.5;
  float h1 = hash12(cell + seed);
  float h2 = hash12(cell + seed + 31.7);
  float h3 = hash12(cell + seed + 63.1);
  float r = mix(0.2, 0.38, h2);
  float room = 0.5 - r;
  vec2 off = (vec2(h3, fract(h2 * 7.13 + h1)) * 2.0 - 1.0) * room * 0.6;
  off.x += room * 0.4 * sin(t * 0.13 + h3 * 6.28);
  float d = length(f - off);
  float disc = 1.0 - smoothstep(r - blur, r, d);
  float rim = smoothstep(r - blur - 0.1, r - blur * 0.5, d) * disc;
  float twinkle = 0.6 + 0.4 * sin(t * 0.25 + h1 * 40.0);
  return vec2(step(h1, density) * disc * (0.6 + 0.4 * rim) * twinkle, h3);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = vec2(uv.x * u_aspect, uv.y) + flow * 0.03;
  vec2 far = bokeh(q, 0.11 * u_height, 0.007, 1.0, 0.06, 0.3, t);
  vec2 mid = bokeh(q, 0.2 * u_height, 0.012, 2.0, 0.1, 0.3, t);
  vec2 near = bokeh(q, 0.36 * u_height, 0.02, 3.0, 0.16, 0.25, t);
  far.x *= 0.55;
  mid.x *= 0.8;
  float ink = far.x + mid.x + near.x;
  float level = (far.x * far.y + mid.x * mid.y + near.x * near.y) / max(ink, 1e-4);
  float mist = snoise(q * 0.8 + vec2(t * 0.01, t * 0.006));
  return vec4(ink * 1.3, level, 0.14 + 0.08 * mist, 0.7 + 0.2 * mist);
}
