import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { flow } from "../src/scenario";

test("when a wait is blocked, the explain function will contain the guard-details", () => {

    const waitingThread = flow({id: 'waitingThread'}, function* () {
         yield bp.wait("nyWaitBid1");
    });

    const blockValuesSmallerThanOne = flow({id: 'blockThread'}, function* () {
        yield bp.block("nyWaitBid1", (x: number) => {
            return x < 1 ? {isValid: true, details: "value needs to be bigger than 0"} : {isValid: false, details: "value is bigger than one"};
        });
    });

    testScenarios((enable) => {
        enable(waitingThread());
        enable(blockValuesSmallerThanOne());
    }, ({event}) => {
        expect(event('nyWaitBid1').explain(1).invalid).toBe(8);
        expect(event('nyWaitBid1').explain(10).valid).toBe(true);
    });
});


// TODO: a block is expained!
// TODO: a guarded block is explained
// TODO: test play/pause

// TODO: THE BTHREADSTATEMAP WILL HOLD STATES OF EVENTS THAT ARE DISABLED OR COMPLETED!