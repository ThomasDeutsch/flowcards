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
