/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { scenarios, BTContext } from '../src/index';


test("overrides are created with .override or .hide", () => {

    function* thread1(this: BTContext) {
        this.override(() => ({Button:  () => () => null}));
        this.override(() => ({Test:  () => () => null}));
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

    function* thread1(this: BTContext) {
        this.override(() => ({Button:  () => () => null}));
        yield bp.request("event");
    }

    scenarios((enable) => {
        enable(thread1);
    }, (scenario) => {
        expect(scenario.overrides["Button"]).toBeUndefined();
    });
});


test("a component override will receive a dispatch function for the waiting event", () => {

    function* thread1(this: BTContext) {
        this.override(({eventOne}) => ({componentX:  () => eventOne}));
        yield bp.wait("eventOne");
    }

    scenarios((enable) => {
        enable(thread1);
    }, (scenario) => {
        const eventOneDispatchFn = scenario.overrides.componentX.overrides[0]();
        expect(eventOneDispatchFn).toBeDefined();
    });
});

test("the component-override will receive all waiting event dispatch functions", () => {

    function* thread1(this: BTContext) {
        this.override(({eventOne, eventTwo}): any => ({componentX : () => [eventOne, eventTwo]}));
        yield [bp.wait("eventOne"), bp.wait("eventTwo")];
    }

    scenarios((enable) => {
        enable(thread1);
    }, (scenario) => {
        const [eventOne, eventTwo] = scenario.overrides.componentX.overrides[0]();
        expect(eventOne).toBeDefined();
        expect(eventTwo).toBeDefined();
    });
});



test("override props get merged", () => {

    function* thread1(this: BTContext) {
        this.override(() => ({ComponentA: {props: {A: 1}}}));
        yield null;
    }
    function* thread2(this: BTContext) {
        this.override(() => ({ComponentA: {props: {B: 1}}}));
        yield null;
    }

    scenarios((enable) => {
        enable(thread1);
        enable(thread2);
    }, (scenario) => {
        expect(scenario.overrides.ComponentA.overrides.length).toEqual(2);
    });
});
