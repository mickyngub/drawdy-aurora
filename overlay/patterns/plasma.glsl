// @render-scale 0.5
// @max-dpr 1
// @grain 1
// @thumb-zoom 4

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = px / (80.0 * u_height) + flow * 0.6;
  vec2 c1 = vec2(5.0 + 3.0 * sin(t * 0.071), 3.0 + 2.5 * cos(t * 0.093));
  vec2 c2 = vec2(2.0 + 4.0 * cos(t * 0.057), 5.0 + 3.0 * sin(t * 0.083));
  float v = sin(q.x * 0.9 + t * 0.21)
    + sin(q.y * 1.1 - t * 0.17)
    + sin((q.x + q.y) * 0.6 + t * 0.13)
    + sin(length(q - c1) * 1.0 - t * 0.23)
    + sin(length(q - c2) * 0.8 + t * 0.19);
  v *= 0.2;
  float level = abs(fract(v * 2.0 + t * 0.03) * 2.0 - 1.0);
  float glow = 0.5 + 0.5 * sin(v * 6.2832 * 1.3 - t * 0.07);
  return vec4(pow(glow, 4.0) * 0.55, level, 0.2 + 0.26 * glow, level);
}
