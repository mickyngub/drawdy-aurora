// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2

float stroke(float d, float w, float aa) {
  return clamp((min(d + 0.5 * aa, 0.5 * w) - max(d - 0.5 * aa, -0.5 * w)) / aa, 0.0, 1.0);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float aa = u_viewport.y / u_res.y;
  float size = 32.0 * u_height;
  const vec2 r = vec2(1.0, 1.7320508);
  vec2 p = (px - 0.5 * u_viewport) / size;
  vec2 a = mod(p, r) - 0.5 * r;
  vec2 b = mod(p - 0.5 * r, r) - 0.5 * r;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  // Centres sit on a half-lattice; rounding gives every pixel of a cell the same hash.
  vec2 id = floor((p - g) / r * 2.0 + 0.5);
  vec2 c = (p - g) * size;
  vec2 ag = abs(g);
  float inner = max(ag.x, dot(ag, vec2(0.5, 0.8660254))) * size;
  float edge = 0.5 * size - inner;

  float n = snoise(c / 520.0 + vec2(t * 0.025, -t * 0.018) + flow * 0.3);
  float w = 0.5 + 0.5 * sin(dot(c, vec2(0.8, 0.6)) / 85.0 - t * 0.32 + 2.2 * n);
  float lit = smoothstep(0.55, 0.95, w + 0.18 * (hash12(id) - 0.5));

  float fillR = lit * (0.5 * size - 3.0);
  float fill = clamp((fillR - inner) / aa + 0.5, 0.0, 1.0) * lit;
  float ink = stroke(edge, 1.1, aa) * (0.42 + 0.75 * lit) + fill * 0.36;
  float level = clamp(0.6 + 0.3 * n - 0.5 * lit, 0.0, 1.0);
  return vec4(ink, level, 0.1 * lit, level);
}
