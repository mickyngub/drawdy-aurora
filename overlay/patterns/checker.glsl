// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 3

float stroke(float d, float w, float aa) {
  return clamp((min(d + 0.5 * aa, 0.5 * w) - max(d - 0.5 * aa, -0.5 * w)) / aa, 0.0, 1.0);
}

float box(vec2 p, float e) {
  vec2 d = abs(p) - e;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float aa = u_viewport.y / u_res.y;
  float size = 30.0 * u_height;
  vec2 p = (px - 0.5 * u_viewport) / size;
  vec2 id = floor(p);
  vec2 q = p - id - 0.5;
  vec2 c = (id + 0.5) * size;

  float n = snoise(c / 900.0 + vec2(t * 0.012, -t * 0.009) + flow * 0.25);
  float phase = (dot(c, vec2(0.857, 0.514)) + 90.0 * n) / 600.0 - t * 0.05;
  // A quarter turn leaves a square looking unchanged, so each band rolls the board on by 90° with no seam.
  float roll = smoothstep(0.3, 0.7, fract(phase));
  float shrink = sin(3.1415927 * roll);
  float tilt = 1.5707963 * roll * (mod(id.x, 2.0) * 2.0 - 1.0);
  vec2 cs = vec2(cos(tilt), sin(tilt));
  float extent = mix(0.44, 0.3, shrink) / (abs(cs.x) + abs(cs.y));
  q = mat2(cs.x, cs.y, -cs.y, cs.x) * q;
  float d = box(q, extent) * size;

  float on = 1.0 - mod(id.x + id.y, 2.0);
  float fill = clamp(0.5 - d / aa, 0.0, 1.0);
  float rim = stroke(abs(d + 0.6), 1.2, aa);
  float ink = on * (fill * 0.2 + rim * 0.3);
  float level = clamp(0.6 + 0.3 * n - 0.45 * shrink, 0.0, 1.0);
  return vec4(ink, level, 0.06 * fill * on, level);
}
