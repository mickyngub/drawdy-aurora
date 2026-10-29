export const FOCUS =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const SECONDARY = `inline-flex h-7.5 cursor-pointer items-center justify-center gap-1 rounded-lg border border-line bg-subtle px-2.5 text-label text-fg-muted transition-colors hover:bg-hover hover:text-fg active:bg-pressed ${FOCUS}`;
export const SECTION = "flex flex-col gap-2";
export const SECTION_LABEL =
    "flex items-center justify-between text-label text-fg-muted";
export const PRESET_GRID =
    "grid grid-cols-3 gap-0.5 rounded-lg bg-control-subtle p-0.5";
export const PRESET = `flex h-12 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md px-1 text-label text-fg-subtle transition-colors hover:text-fg aria-pressed:bg-control aria-pressed:text-fg ${FOCUS}`;
export const SWATCH = "h-1.5 w-9 rounded-full bg-(image:--swatch)";
export const SLIDER = `h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,var(--color-accent)_var(--fill),var(--color-control)_var(--fill))] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-[0_1px_2px_rgb(0_0_0/0.3)] [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent ${FOCUS}`;
export const CHECKBOX = `peer col-start-1 row-start-1 m-0 size-4 cursor-pointer appearance-none rounded-sm border border-line-strong transition-colors checked:border-transparent checked:bg-accent-pressed ${FOCUS}`;
