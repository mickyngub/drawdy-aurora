// @render-scale 1
// @max-dpr 2
// @thumb-zoom 1.5

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float cellPx = 22.0 * u_height;
  vec2 centre = (floor(px / cellPx) + 0.5) * cellPx;
  // Sampled once per cell so each dot stays round.
  vec2 drift = (texture(u_flow, centre / u_viewport).xy - 0.5) * (2.0 * MAX_VELOCITY) * u_motion;
  float n = fbm2(centre / u_viewport.y * 2.2 + vec2(t * 0.06, -t * 0.045) + drift * 0.4);
  float level = smoothstep(-0.55, 0.75, n);
  float radius = cellPx * 0.38 * level;
  float d = length(px - centre);
  float aa = max(fwidth(d), 0.5);
  float dot = 1.0 - smoothstep(radius - aa, radius + aa, d);
  return vec4(dot * mix(0.3, 1.0, level) * 0.8, 1.0 - level, 0.12 * level, 0.8);
}
