/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios, ThreadContext } from '../src/index';


test("a state can be created that will listen for requests in its name", () => {

    function* thread1(this: ThreadContext) {
        this.show("Button", () => () => null);
        yield bp.wait("event");
    }

    scenarios((enable) => {
        enable(thread1);
    }, (scenario) => {
        expect(scenario.overrides["Button"]).toBeDefined();
    });
});