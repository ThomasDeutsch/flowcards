/* eslint-disable @typescript-eslint/no-explicit-any */

// EQUALITY / DUCKTYPING --------------------

export function areInputsEqual(nextDeps: any[], prevDeps: any[] | null): boolean {
    if (prevDeps === null) {
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

export function isThenable(p: any): boolean { // promise duck-typing:  https://www.bookstack.cn/read/AsyncPerformance/spilt.2.ch3.md
    return p !== null && (typeof p === "object" || typeof p === "function") && typeof p.then === "function";
}


// ARRAY --------------------

export function last<T>(a: T[]): T | undefined {
    if(a.length === 0) return undefined;
    return a[a.length-1];
}

export function hasItems<T>(coll: T[] | null): boolean {
    return (coll !== null && coll.length > 0);
}

export function getRandom<T>(coll: T[]): T {
    if (coll.length === 1) {
        return coll[0];
    }
    const randomItemIndex = Math.floor(Math.random() * coll.length);
    return coll[randomItemIndex];
}

// SET ----------------------

export function union<T>(sets: Set<T>[]): Set<T> {
    return new Set<T>(sets.reduce((acc: T[], set: Set<T>) => [...acc, ...set], []));
}