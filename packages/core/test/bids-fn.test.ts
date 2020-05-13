  import * as bp from "../src/bid";
import {testScenarios } from './testutils'

test("a bid-function: 'yield () => ...' will be evaluated every cycle", () => {
    let count = 0;
    let cycleNr = 0;

    function* requestThread() {
        yield bp.request("A", 1000);
        yield bp.request("A", 2000);
    }

    function* fnThread() {
        yield () => {
            count++;
            return bp.wait("never");
        }
    }

    testScenarios((enable) => {
        cycleNr++;
        enable(requestThread);
        enable(fnThread);
    });

    expect(count).toBe(cycleNr); 
});


test("a bid-function can return a single bid", () => {

    function* requestThread() {
        yield bp.request("A", 1000);
    }

    function* fnThread() {
        const receivedValue = yield () => bp.wait("A");
        expect(receivedValue).toBe(1000);
    }

    testScenarios((enable) => {
        enable(requestThread);
        enable(fnThread);
    });

    
});


test("a bid-function can return multiple bids", () => {

    function* requestThread() {
        yield bp.request("A", 1000);
    }

    function* fnThread(): any {
        const [receivedEvent, receivedValue] = yield () => [bp.wait("A"), bp.wait("B")];
        expect(receivedValue).toBe(1000);
        expect(receivedEvent.name).toBe("A");
    }

    testScenarios((enable) => {
        enable(requestThread);
        enable(fnThread);
    });


});