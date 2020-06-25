import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { FCEvent } from "../src/event";

test("an 'on' bid will be advanced, if an event is requested", () => {
    let hasAdvanced = false;

    function* thread1() {
        yield bp.request("A");
    }

    function* thread2() {
        yield bp.on("A");
        hasAdvanced = true;
    }

    testScenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, ({log})=> {
        expect(hasAdvanced).toBe(true);
        expect(log?.latestAction.event.name).toBe("A");
        expect(log?.latestReactionByThreadId).toHaveProperty("thread1");
    });
});

test("an 'on' bid can not be dispatched", () => {

    function* thread() {
        yield bp.on("A");
        hasAdvanced = true;
    }

    testScenarios((enable) => {
        enable(thread);
    }, ({dispatch})=> {
        expect(dispatch['A']).toBe(undefined);
    });
});