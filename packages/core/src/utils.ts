// EQUALITY / DUCK-TYPING --------------------

export function getChangedProps(nextDeps: Record<string, any>, prevDeps?: Record<string, any>): string[] | undefined {
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
export function isThenable(p?: any): boolean { 
    return p !== undefined && p !== null && (typeof p === "object" || typeof p === "function") && typeof p.then === "function";
}

// UNDEFINED CHECK --------------

export function notUndefined<T>(value?: T): value is T {
    return value !== undefined;
}

// ARRAY --------------------

export function toArray<T>(x: T | T[]): T[] {
    if(Array.isArray(x)) return x;
    return [x];
}

export function flattenShallow<T>(arr?: T[][]): T[] {
    if(!arr) return [];
    return arr.reduce((acc, val) => acc.concat(val), []);
}

export function latest<T>(arr?: T[]): T | undefined {
    if(!arr || arr.length === 0) return undefined;
    return arr[arr.length-1];
}

// UUID ------------------------
// taken from: https://stackoverflow.com/a/2117523/1433691
// waiting for proposal: https://github.com/tc39/proposal-uuid
export function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  