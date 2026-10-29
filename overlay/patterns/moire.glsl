// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2.5

// Coverage of one ring set; |grad r| is 1, so the distance is already in CSS px.
float rings(vec2 px, vec2 centre, float spacing, float phase, float wpx, float scale) {
  float v = length(px - centre) / spacing - phase;
  float dist = abs(fract(v + 0.5) - 0.5) * spacing * scale;
  return clamp(0.5 + max(wpx, 1.0) * 0.5 - dist, 0.0, 1.0) * min(wpx, 1.0);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float scale = u_res.y / u_viewport.y;
  float spacing = 10.0 * u_height;
  float wpx = 1.0 * scale;
  vec2 p = px + flow * 30.0;
  float s = t * 0.03;
  vec2 hub = u_viewport * (vec2(0.5, 0.5) + vec2(0.2 * sin(s * 0.31), 0.16 * cos(s * 0.23)));
  // Centres only a few rings apart, so the interference makes broad fringes rather than a mesh.
  vec2 apart = spacing * vec2(2.5 + 1.5 * sin(s * 0.7), 1.5 * cos(s * 0.5));
  float a = rings(p, hub - apart, spacing, t * 0.03, wpx, scale);
  float b = rings(p, hub + apart, spacing, -t * 0.02, wpx, scale);
  float ink = 1.0 - (1.0 - a) * (1.0 - b);
  float level = (a * 0.1 + b * 0.8) / max(a + b, 1e-4);
  float far = smoothstep(0.05, 0.55, length(p - hub) / length(u_viewport));
  ink *= 1.2 * mix(1.0, 0.35, far) * mix(0.6, 1.0, smoothstep(0.4, 1.0, u_height));
  return vec4(ink, level, 0.0, 0.5);
}
