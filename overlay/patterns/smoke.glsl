// @render-scale 0.5
// @max-dpr 1
// @grain 1
// @thumb-zoom 6

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = vec2(uv.x * u_aspect, uv.y) + flow * 0.03;
  // Stretched vertically so the swirls read as rising plumes rather than marble.
  vec2 p = vec2(q.x * 1.3, q.y * 0.7) / u_height - vec2(t * 0.006, t * 0.02);
  vec2 a = vec2(fbm2(p + vec2(0.0, t * 0.02)), fbm2(p + vec2(5.2, 1.3) - t * 0.015));
  vec2 b = vec2(fbm2(p + 1.25 * a + vec2(1.7, 9.2) + t * 0.01), fbm2(p + 1.25 * a + vec2(8.3, 2.8)));
  float f = fbm3(p + 1.2 * b);
  float wisp = exp(-abs(f) * 7.0 * sqrt(u_height));
  float mask = smoothstep(0.0, 0.5, 0.8 * a.x + 0.5 * b.y);
  float level = clamp(0.45 + 0.3 * b.x, 0.0, 1.0);
  return vec4(wisp * mask * 1.4, level, 0.05 + 0.3 * mask * exp(-abs(f) * 2.5), clamp(level + 0.2, 0.0, 1.0));
}
