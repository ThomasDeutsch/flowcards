export function getChangedProps(nextDeps?: Record<string, any>, prevDeps?: Record<string, any>): string[] | undefined {
    if ((prevDeps === undefined || prevDeps === null)) {
        if(prevDeps === nextDeps) return undefined;
        return Object.keys(nextDeps);
    }
    const result = {...prevDeps};
    for (const key in nextDeps) {
        if((key in prevDeps) && Object.is(nextDeps[key], prevDeps[key])) {
            delete result[key];
        }
    }
    const keys = Object.keys(result);
    return keys.length > 0 ? keys : undefined;
}


// promise duck-typing:  https://www.bookstack.cn/read/AsyncPerformance/spilt.2.ch3.md
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isThenable(p?: any): boolean {
    return p !== undefined && p !== null && (typeof p === "object" || typeof p === "function") && typeof p.then === "function";
}


export function toArray<T>(x: T | T[]): T[] {
    if(Array.isArray(x)) return x;
    return [x];
}


export function notEmpty<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}
