import { AccumulatedValidationResults } from "./action-explain";

/**
 * @internal
 * check if a value is thenable (possibly a promise)
 * @param p a possible candidate for a promise
 * @returns true if p is thenable
 * @internalRemarks promise duck-typing:  https://www.bookstack.cn/read/AsyncPerformance/spilt.2.ch3.md
 */
export function isThenable(p?: unknown): p is Promise<unknown> {
    return p !== undefined && typeof p === 'object' && typeof (p as PromiseLike<unknown>).then === 'function';
}

/**
 * @internal
 * assert that a value is not null or undefined.
 * Best used in a filter function, to filter out null or undefined values and tell TypeScript that
 * the value is guaranteed to be of type T
 * @param value the value to check
 * @returns true if the value is not null or undefined
 */
 export function isDefined<T>(value: T | null | undefined): value is T {
    return (value !== null && value !== undefined);
  }

  /**
   * @internal
   * append an item to the end of a possible undefined array
   * @param coll an array of a Generic Type or undefined
   * @param item the item to add to the array, or create a new array with the item
   * @returns array with the item added
   */
  export function appendTo<T>(coll: T[] | undefined, item: T): T[] {
    if(coll === undefined) return [item];
    coll.push(item);
    return coll;
  }

  /**
   * @internal
   * compares two dependency arrays for equality
   * uses Object.is to compare values
   * @param a the first array of Records, strings, numbers, booleans, etc.
   * @param b the second array
   * @returns true if the arrays are equal (same length and same values)
   */
  export function areDepsEqual(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
    if(a.length !== b.length) return false;
    return a.every((v, i) => Object.is(v, b[i]));
  }

/**
 * get the flattened details of all failed validations.
 * @param results the validation results
 * @returns details of all failed validations.
 */
  export function invalidDetails<V>(results: AccumulatedValidationResults<V>): V[] {
    return results.results.flatMap((r) => !r.isValid ? r.details : []);
}