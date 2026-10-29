declare module "virtual:aurora-patterns" {
    const builds: Record<string, import("../src/patterns").PatternBuild>;
    export default builds;
}
