/**
 * returns a promise that resolves after a given number of milliseconds
 * @param ms the number of milliseconds to wait
 * @param value the value to resolve the promise with
 * @returns a promise that resolves after a given number of milliseconds
 */
export function delay<T>(ms: number, value: T): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

/**
 * returns a promise that rejects after a given number of milliseconds
 * @param ms the number of milliseconds to wait
 * @param value the value to resolve the promise with
 * @returns a promise that rejects after a given number of milliseconds
 */
export function failedDelay<T>(ms: number, value: T): Promise<T> {
    return new Promise((resolve, reject) => setTimeout(() => reject(value), ms));
}

/**
 * returns a promise that rejects after a given number of milliseconds
 * @param ms the number of milliseconds to wait
 * @param value the value to resolve the promise with
 * @returns a promise that rejects after a given number of milliseconds
 */
export function throwingDelay<T>(ms: number, value: T): Promise<T> {
    return new Promise((resolve, reject) => {throw new Error('testError')});
}
