// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2

// The ramp " .:-=+*#%@" as 5 x 7 bitmaps: per character, rows 0-3 then rows 4-6, 5 bits a row, bit 0 the left pixel.
const int FONT[20] = int[20](
  0, 0, 0, 6336, 6336, 198, 1015808, 0, 31744, 31,
  1020032, 132, 480384, 149, 359754, 10591, 139875, 25378, 718382, 30781
);

float glyphBit(int c, vec2 g) {
  if (g.x < 0.0 || g.x > 4.0 || g.y < 0.0 || g.y > 6.0) return 0.0;
  int row = int(g.y);
  int word = FONT[c * 2 + (row < 4 ? 0 : 1)];
  return float((word >> ((row < 4 ? row : row - 4) * 5 + int(g.x))) & 1);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 p = vec2(px.x, u_viewport.y - px.y);
  float pix = max(1.0, floor(2.0 * u_height + 0.5));
  vec2 cellSize = vec2(6.0, 9.0) * pix;
  vec2 cell = floor(p / cellSize);
  vec2 g = floor((p - cell * cellSize) / pix) - vec2(0.0, 1.0);

  vec2 q = (cell + 0.5) * cellSize / (190.0 + 70.0 * pix);
  vec2 drift = vec2(t * 0.03, t * 0.018);
  vec2 warp = vec2(snoise(q * 0.55 + drift.yx), snoise(q * 0.55 - drift + 5.2));
  float n = fbm2(q + drift + warp * 0.45 + flow * 0.2);
  float shade = smoothstep(-0.1, 0.8, n);

  float f = shade * 9.0;
  int c = int(min(floor(f), 8.0));
  float blend = smoothstep(0.35, 0.65, fract(f));
  float lit = mix(glyphBit(c, g), glyphBit(c + 1, g), shade >= 1.0 ? 1.0 : blend);
  float bright = shade * shade;
  float ink = lit * (0.32 + 0.6 * bright + 0.7 * smoothstep(0.82, 1.0, shade));
  return vec4(ink, 1.0 - shade, 0.1 * smoothstep(-0.3, 0.9, n), 0.75);
}
