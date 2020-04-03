/* eslint-disable @typescript-eslint/no-explicit-any */


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


// promise duck-typing
export function isThenable(p: any): boolean {
    return p !== null && (typeof p === "object" || typeof p === "function") && typeof p.then === "function";
}


export function getRandomString(coll: string[]): string {
    if (coll.length === 1) {
        return coll[0];
    }
    const randomItemIndex = Math.floor(Math.random() * coll.length);
    return coll[randomItemIndex];
}