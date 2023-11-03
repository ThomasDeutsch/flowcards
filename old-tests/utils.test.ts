import { areDepsEqual } from "../src/utils";

describe("the deps are equal function", () => {

    test('will return true if two empty arrays are used', () => {
        expect(areDepsEqual([], [])).toBe(true);
    });

    test('the same array, is equal', () => {
        const x = [1, 2, 3];
        expect(areDepsEqual(x, x)).toBe(true);
    });

    test('different arrays with the same content are equal', () => {
        const obj = {a: 1};
        const x = [1, 2, obj];
        const y = [1, 2, obj];
        expect(areDepsEqual(x, y)).toBe(true);
    });

    test('different arrays with different elements are not equal', () => {
        const obj = {a: 1};
        const x = [1, 2, obj];
        const y = [1, 2, {...obj}];
        expect(areDepsEqual(x, y)).toBe(false);
    });
});