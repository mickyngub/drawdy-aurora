// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2

// Box-filtered coverage of a w px line at distance d px, so sub-pixel lines fade instead of breaking up.
float stroke(float d, float w, float aa) {
  return clamp((min(d + 0.5 * aa, 0.5 * w) - max(d - 0.5 * aa, -0.5 * w)) / aa, 0.0, 1.0);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float aa = u_viewport.y / u_res.y;
  float cell = 26.0 * u_height;
  vec2 p = px - 0.5 * u_viewport;
  vec2 minorD = abs(fract(p / cell + 0.5) - 0.5) * cell;
  vec2 majorD = abs(fract(p / (4.0 * cell) + 0.5) - 0.5) * (4.0 * cell);
  float minor = max(stroke(minorD.x, 1.0, aa), stroke(minorD.y, 1.0, aa));
  float major = max(stroke(majorD.x, 1.4, aa), stroke(majorD.y, 1.4, aa));

  float bend = 70.0 * snoise(p / 640.0 + vec2(0.0, t * 0.02) + flow * 0.3);
  float front = (dot(p, vec2(0.894, 0.447)) + bend - t * 42.0) / 820.0;
  float x = (fract(front) - 0.5) * (820.0 / 150.0);
  float pulse = exp(-x * x);

  float r = (1.1 + 1.3 * pulse) * min(1.0, 0.4 + 0.6 * u_height);
  float node = clamp((r - length(minorD)) / aa + 0.5, 0.0, 1.0);
  float majorNode = clamp((r + 0.8 - length(majorD)) / aa + 0.5, 0.0, 1.0);
  float nodes = max(node * 1.2, majorNode * 1.6) * pulse;

  float n = fbm2(p / 900.0 + vec2(t * 0.015, -t * 0.01) + flow * 0.2);
  float lines = max(minor * 0.42, major * 0.8) * (0.85 + 0.2 * n) * (1.0 + 1.2 * pulse);
  float level = clamp(0.62 + 0.32 * n - 0.5 * pulse, 0.0, 1.0);
  return vec4(max(lines, nodes), level, 0.14 * pulse, level);
}
