// @render-scale 0.5
// @max-dpr 1
// @grain 1
// @thumb-zoom 6

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = vec2(uv.x * u_aspect, uv.y) + flow * 0.03;
  vec2 warp = vec2(snoise(q * 0.9 + vec2(t * 0.02, 1.3)), snoise(q * 0.9 + vec2(4.1, -t * 0.017)));
  vec2 p = q + 0.12 * warp;
  float sigma2 = 0.18 * pow(u_height, 1.2);
  float d2[5];
  float nearest = 1e9;
  for (int i = 0; i < 5; i++) {
    float k = float(i);
    vec2 c = vec2(
      u_aspect * (0.5 + 0.4 * sin(t * (0.031 + 0.007 * k) + k * 2.4)),
      0.5 + 0.38 * sin(t * (0.027 + 0.006 * k) + k * 1.3 + 0.9));
    vec2 d = p - c;
    d2[i] = dot(d, d);
    nearest = min(nearest, d2[i]);
  }
  // Weights are relative to the nearest pool so a small blend size cannot underflow to zero.
  float sum = 0.0;
  float level = 0.0;
  for (int i = 0; i < 5; i++) {
    float w = exp(-(d2[i] - nearest) / sigma2);
    sum += w;
    level += w * float(i) * 0.25;
  }
  level /= sum;
  float glow = exp(-nearest / sigma2);
  return vec4(0.35 * glow, level, 0.35 + 0.2 * glow, level);
}
