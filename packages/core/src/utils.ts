// EQUALITY / DUCK-TYPING --------------------

export function areInputsEqual(nextDeps: any[], prevDeps?: any[]): boolean {
    if (prevDeps === undefined || prevDeps === null) {
        return false;
    }
    for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
        if (Object.is(nextDeps[i], prevDeps[i])) {
            continue;
        }
        return false;
    }
    return true;
}

export function isThenable(p?: any): boolean { // promise duck-typing:  https://www.bookstack.cn/read/AsyncPerformance/spilt.2.ch3.md
    return p !== undefined && p !== null && (typeof p === "object" || typeof p === "function") && typeof p.then === "function";
}

// UNDEFINED CHECK --------------

export function notUndefined<T>(value?: T): value is T {
    return value !== undefined;
}

// ARRAY --------------------

export function getRandom<T>(coll: T[]): T {
    if (coll.length === 1) return coll[0];
    const randomItemIndex = Math.floor(Math.random() * coll.length);
    return coll[randomItemIndex];
}

export function toArray<T>(x: T | T[]): T[] {
    if(Array.isArray(x)) return x;
    return [x];
}

export function flattenShallow<T>(arr: T[][]): T[] {
    return arr.reduce((acc, val) => acc.concat(val), []);
}

// SET ----------------------

export function union<T>(...sets: (Set<T> | undefined)[]): Set<T> | undefined {
    if(sets.length === 0) return undefined;
    const notUndefindedSets = sets.filter(notUndefined);
    if(notUndefindedSets.length === 0) return undefined;
    return new Set<T>(notUndefindedSets.reduce((acc: T[], set: Set<T>) => [...acc, ...set], []));
}

// UUID ------------------------
// taken from: https://stackoverflow.com/a/2117523/1433691
// waiting for proposal: https://github.com/tc39/proposal-uuid
export function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  