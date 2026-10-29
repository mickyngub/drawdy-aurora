#version 300 es
precision highp float;

// ─────────────────────────────────────────────────────────────────────────────
// Flow pass: a tiny 2D velocity field that every surface shader reads as a
// distortion source. It is what makes the smoke feel like a fluid rather than
// scrolling noise, and it is the only place pointer motion enters the pipeline
// as a *force* instead of a position.
//
// The field is ping-ponged between two low-resolution RGBA8 targets. RGBA8, not
// float: an 8-bit target needs no EXT_color_buffer_float, works on every WebGL2
// device, and the quantisation is hidden by the dither below. Velocity is packed
// into RG as v / (2 * MAX_VELOCITY) + 0.5, so 128 means "at rest".
//
// MAX_VELOCITY is injected as a #define by the TypeScript side so the pack and
// unpack constants can never drift apart between JS and GLSL.
// ─────────────────────────────────────────────────────────────────────────────

uniform sampler2D u_previous;   // last frame's field
uniform vec2  u_res;
uniform float u_dt;             // clamped by the harness, never larger than 50 ms
uniform float u_time;
uniform float u_aspect;

// Pointer, in 0..1 canvas space with the origin at the bottom-left.
uniform vec2  u_pointer;
uniform vec2  u_pointerVel;
uniform float u_presence;       // 0..1 hover envelope; scales all pointer force
uniform float u_scale;          // 1.0 for a mouse, larger for a coarse finger

// Autonomous drift so the field is never completely dead with no pointer.
uniform vec2  u_breeze;
uniform vec2  u_breezeVel;

// One-shot impulses: u_impulse is fired by the surface (e.g. an audio onset),
// u_tapImpulse by a pointer press. Both are decayed on the CPU.
uniform vec2  u_impulse;
uniform vec2  u_impulsePos;
uniform vec2  u_tapImpulse;
uniform vec2  u_tapImpulsePos;

// Tunables. Exposed as uniforms rather than constants so a designer can animate
// them, and so the demo can sweep them without a shader recompile.
uniform float u_fieldDecay;     // viscosity: higher drains motion faster
uniform float u_pointerForce;   // how hard the pointer drags the field
uniform float u_stillnessPull;  // inward gather when the pointer stops moving
uniform float u_forceRadius;    // squared radius of every injection gaussian

out vec4 fragColor;

#pragma include(HASH)

vec2 decodeVelocity(vec4 texel) {
  return (texel.xy - 0.5) * (2.0 * MAX_VELOCITY);
}

// Injection falloff. Every force below shares this shape so nothing has a hard
// edge; a gaussian is the cheapest kernel that stays smooth at the rim.
float falloff(vec2 offset, float radiusSquared) {
  return exp(-dot(offset, offset) / radiusSquared);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  // Semi-Lagrangian advection: look up where this parcel of fluid came from and
  // inherit its velocity. Stepping back by only 0.6 * dt under-relaxes on
  // purpose; a full step at this resolution smears the field into mush.
  vec2 localVelocity = decodeVelocity(texture(u_previous, uv));
  vec2 velocity = decodeVelocity(texture(u_previous, uv - localVelocity * u_dt * 0.6));

  // Exponential decay rather than a linear subtraction, so the settle time is
  // independent of frame rate.
  velocity *= exp(-u_dt * u_fieldDecay);

  float pointerRadius = u_forceRadius * u_scale * u_scale;

  vec2 toPointer = uv - u_pointer;
  toPointer.x *= u_aspect;   // circular in pixels, not in UV

  // A moving pointer drags the field along with it. This is the combing.
  velocity += u_pointerVel
            * falloff(toPointer, pointerRadius)
            * u_presence * u_dt * u_pointerForce;

  // A pointer that has stopped gathers the field inward instead, so hovering
  // still reads as attention rather than as nothing happening. The two forces
  // cross-fade on pointer speed and never both act at full strength.
  float stillness = 1.0 - smoothstep(0.15, 1.0, length(u_pointerVel));
  vec2 inward = toPointer / max(length(toPointer), 1e-3);
  velocity -= inward
            * falloff(toPointer, pointerRadius * 1.8)
            * u_presence * stillness * u_dt * u_stillnessPull;

  // Wider, weaker, and always on: the idle life of the field.
  vec2 toBreeze = uv - u_breeze;
  toBreeze.x *= u_aspect;
  velocity += u_breezeVel
            * falloff(toBreeze, u_forceRadius * 4.0)
            * u_dt * u_pointerForce;

  // Surface-fired impulse. Widest radius of the three, because it stands in for
  // a whole-band event (a syllable, a beat) rather than a point of contact.
  vec2 toImpulse = uv - u_impulsePos;
  toImpulse.x *= u_aspect;
  velocity += u_impulse
            * falloff(toImpulse, u_forceRadius * 6.0)
            * u_dt * u_pointerForce;

  // Tap impulse, scaled with the pointer so a finger tap disturbs more than a
  // mouse click does.
  vec2 toTap = uv - u_tapImpulsePos;
  toTap.x *= u_aspect;
  velocity += u_tapImpulse
            * falloff(toTap, pointerRadius * 5.0)
            * u_dt * u_pointerForce;

  velocity = clamp(velocity, vec2(-MAX_VELOCITY), vec2(MAX_VELOCITY));

  // One LSB of noise before quantising to 8 bits. Without it the slow decay
  // lands on the same integer for many frames and the field visibly terraces
  // into flat plateaus.
  float dither = (hash12(gl_FragCoord.xy + fract(u_time) * 61.7) - 0.5)
               * (2.0 * MAX_VELOCITY / 255.0);

  fragColor = vec4((velocity + dither) / (2.0 * MAX_VELOCITY) + 0.5, 0.0, 1.0);
}
