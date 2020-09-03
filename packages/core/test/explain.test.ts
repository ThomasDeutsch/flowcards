import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { flow } from "../src/scenario";

test("an extend can be resolved in the same cycle", () => {

    const requestingThread = flow(null, function* () {
        const val: number = yield bp.request("A", 1);
    });

    const blockingThread = flow(null, function* () {
        yield bp.block("A", <any>(x: string) => {
            return x > 0 ? {isValid: true, details: "34"} : true;
        });
    });

    testScenarios((enable) => {
        enable(requestingThread());
        enable(blockingThread());
    }, ({explain}) => {
        expect(explain('A')).toBe(true);
    });
});