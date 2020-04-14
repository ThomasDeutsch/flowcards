/* eslint-disable @typescript-eslint/no-explicit-any */

// EQUALITY / DUCK-TYPING --------------------

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

// NULL CHECK --------------

export function notNull<T>(value: T | null): value is T {
    return value !== null;
}

// OBJECT -------------------

export function withoutProperties(properties: string[], obj: Record<string, any>) {
    const result = {...obj};
    properties.forEach(prop => delete result[prop]);
    return result;
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

// SET ----------------------

export function union<T>(sets: Set<T>[]): Set<T> {
    return new Set<T>(sets.reduce((acc: T[], set: Set<T>) => [...acc, ...set], []));
}