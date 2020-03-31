/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios, ThreadContext } from '../src/index';


test("overrides are created with .show or .hide", () => {

    function* thread1(this: ThreadContext) {
        this.override("Button", () => () => null);
        this.override("Test", () => () => null);
        this.hide("HiddenComponent");
        yield bp.wait("event");
    }

    scenarios((enable) => {
        enable(thread1);
    }, (scenario) => {
        expect(scenario.overrides["Button"]).toBeDefined();
        expect(scenario.overrides["Test"]).toBeDefined();
        expect(scenario.overrides["HiddenComponent"]).toBeDefined();
    });
});


test("overrides are removed when the thread progresses.", () => {

    function* thread1(this: ThreadContext) {
        this.override("Button", () => () => null);
        yield bp.request("event");
    }

    scenarios((enable) => {
        enable(thread1);
    }, (scenario) => {
        expect(scenario.overrides["Button"]).toBeUndefined();
    });
});