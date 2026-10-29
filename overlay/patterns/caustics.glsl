// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 4

// Light under a wavy surface focuses where the surface's curvature folds: brightness ~ 1 / |det(I + focus * Hessian)|.
vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = vec2(uv.x * u_aspect, uv.y) + flow * 0.03;
  vec2 warp = vec2(snoise(q * 1.1 + vec2(t * 0.02, 3.7)), snoise(q * 1.1 + vec2(8.2, -t * 0.017)));
  vec2 p = q / (0.055 * u_height) + 0.8 * warp;
  mat2 curve = mat2(0.0);
  for (int n = 0; n < 8; n++) {
    float k = float(n);
    float ang = k * 0.3927 + 0.25 * sin(k * 3.1);
    float freq = 0.7 + 0.6 * fract(k * 0.618 + 0.2);
    vec2 dir = vec2(cos(ang), sin(ang)) * freq;
    curve -= outerProduct(dir, dir) * sin(dot(dir, p) - t * 0.35 * sqrt(freq) + k * 1.3);
  }
  float light = 1.0 / (abs(determinant(mat2(1.0) + 0.8 * curve)) * sqrt(u_height) + 0.03);
  float lines = clamp((light - 1.5) * 0.1, 0.0, 1.0);
  float level = clamp(0.55 + 0.4 * warp.x - 0.25 * lines, 0.0, 1.0);
  return vec4(lines * (1.1 + 0.3 * warp.y), level, 0.12 + 0.1 * min(light * 0.1, 1.0), clamp(0.7 + 0.25 * warp.y, 0.0, 1.0));
}
