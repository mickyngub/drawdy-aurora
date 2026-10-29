// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 5

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float horizonY = u_viewport.y * 0.36;
  float cx = u_viewport.x * 0.5;
  float grid = 80.0 * u_height;
  float cssPx = u_res.y / u_viewport.y;

  float dy = horizonY - px.y;
  float z = horizonY / max(dy, 1e-3);
  vec2 g = vec2((px.x - cx + flow.x * 20.0) * z / grid, z * horizonY * 2.0 / grid + t * 0.35);
  vec2 fw = max(fwidth(g), vec2(1e-4));
  vec2 dist = abs(fract(g + 0.5) - 0.5) / fw;
  float width = 1.2 * cssPx;
  vec2 line = (1.0 - smoothstep(width * 0.5, width * 0.5 + 1.0, dist)) * (1.0 - smoothstep(0.12, 0.4, fw));
  float fog = exp(-(z - 1.0) * 0.18);
  float floorInk = step(0.0, dy) * max(line.x, line.y) * fog;

  float r = u_viewport.y * 0.2;
  vec2 d = px - vec2(cx, horizonY);
  float sunDist = length(d);
  float s = d.y / r;
  float aa = 1.0 / cssPx;
  float disc = (1.0 - smoothstep(r - aa, r + aa, sunDist)) * smoothstep(-aa, aa, d.y);
  float band = s * 7.0 + t * 0.12;
  float gap = smoothstep(0.62, 0.05, s) * 0.6;
  float bw = fwidth(band);
  float stripes = mix(1.0, smoothstep(gap - bw, gap + bw, fract(band)), smoothstep(0.0, bw, gap));
  float sunInk = disc * stripes * mix(0.5, 0.35, s);

  float halo = exp(-max(sunDist - r, 0.0) / (0.35 * r)) * step(0.0, d.y);
  float horizonGlow = exp(-abs(dy) / (0.05 * u_viewport.y)) * smoothstep(0.0, 0.25, uv.x) * smoothstep(1.0, 0.75, uv.x);
  // grain is off for the crisp grid, so the wide halo carries its own one-step dither against 8-bit banding.
  float haze = 0.28 * halo + 0.22 * horizonGlow;
  haze += (hash12(gl_FragCoord.xy) - 0.5) * 0.013 * smoothstep(0.0, 0.02, haze);

  float ink = max(floorInk, sunInk);
  float level = sunInk > floorInk ? clamp(0.55 - s * 0.55, 0.0, 1.0) : 0.85;
  return vec4(ink, level, haze, mix(0.75, 0.35, halo));
}
