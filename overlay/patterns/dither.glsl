// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 1.5

// 8 x 8 Bayer index: the bits of x ^ y and y interleaved, then reversed.
float bayer8(vec2 cell) {
  int x = int(mod(cell.x, 8.0));
  int y = int(mod(cell.y, 8.0));
  int xy = x ^ y;
  int i = ((xy & 1) << 5) | ((y & 1) << 4) | ((xy & 2) << 2) | ((y & 2) << 1) | ((xy & 4) >> 1) | ((y & 4) >> 2);
  return (float(i) + 0.5) / 64.0;
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float size = max(1.0, floor(3.0 * u_height + 0.5));
  vec2 cell = floor(px / size);
  vec2 q = (cell + 0.5) * size / (200.0 + 50.0 * size);
  vec2 drift = vec2(t * 0.035, -t * 0.025);
  float warp = snoise(q * 0.6 + drift.yx * 0.8);
  float n = fbm2(q + drift + warp * 0.35 + flow * 0.2);
  float shade = smoothstep(0.0, 0.85, n);
  float lit = step(bayer8(cell), shade * 0.55);

  float tone = (1.0 - shade) * 2.3 + 0.7 * (0.5 + 0.5 * snoise(q * 0.3 - drift * 0.5 + 9.1));
  float level = clamp(floor(tone + bayer8(cell.yx + vec2(3.0, 5.0))), 0.0, 3.0) / 3.0;
  return vec4(lit * 0.85, level, 0.08 * shade, clamp(tone / 3.0, 0.0, 1.0));
}
