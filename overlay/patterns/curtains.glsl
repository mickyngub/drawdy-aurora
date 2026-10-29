// @render-scale 0.5
// @max-dpr 1
// @grain 1
// @thumb-zoom 6

// A curtain hangs from a wavy lower edge: sharp below, rays fading upward.
vec2 curtain(vec2 q, float base, float seed, float t, float drift) {
  float edge = base
    + 0.11 * snoise(vec2(q.x * 0.55 + seed, t * 0.03))
    + 0.04 * snoise(vec2(q.x * 1.8 - t * 0.05, seed + 2.3))
    + 0.03 * sin(t * 0.04 + seed);
  float d = q.y - edge;
  float rise = max(d, 0.0);
  float body = exp(-rise / (0.2 * u_height)) * exp(-max(-d, 0.0) / 0.025);
  float rays = 0.55 + 0.45 * snoise(vec2(q.x * 9.0 + seed * 3.7 + drift, t * 0.07 + seed));
  return vec2(body * rays, rise / (0.3 * u_height));
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = vec2(uv.x * u_aspect, uv.y) + flow * 0.03;
  float drift = flow.x * 0.6;
  vec2 low = curtain(q, 0.16, 1.3, t, drift);
  vec2 mid = curtain(q, 0.47, 7.9, t * 0.85, drift);
  vec2 high = curtain(q, 0.76, 4.4, t * 1.1, drift);
  float hazeField = fbm2(q * 0.8 + vec2(t * 0.012, -t * 0.009) + flow * 0.2);
  float sum = low.x + mid.x + high.x;
  float level = (low.y * low.x + mid.y * mid.x + high.y * high.x) / max(sum, 1e-4);
  return vec4(sum * 0.75, level, 0.28 + 0.14 * hazeField, 0.75 + 0.2 * hazeField);
}
