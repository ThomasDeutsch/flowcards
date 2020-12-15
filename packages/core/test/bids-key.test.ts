import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { scenario } from "../src/scenario";

test("keys can be a string or a number", () => {
    const thread1 = scenario(null, function* () {
        yield bp.askFor({name: 'A', key: "1"});
    });

    const thread2 = scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 2});
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event})=> {
        expect(event({name: 'A', key: '1'}).dispatch).toBeDefined();
        expect(event({name: 'A', key: 1}).dispatch).toBeUndefined();
        expect(event({name: 'A', key: 2}).dispatch).toBeDefined();
        expect(event({name: 'A', key: '2'}).dispatch).toBeUndefined();
    });
});


test("an event with a key will be blocked by a block with the same name and key", () => {
    let advancedKey1 = false;
    let advancedKey2 = false;

    const thread1 = scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 1});
        advancedKey1 = true;
    });

    const thread2 = scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 2});
        advancedKey2 = true;
    });

    const blockingThread = scenario(null, function* () {
        yield bp.block({name: 'A', key: 1});
    });

    const requestingThread = scenario(null, function* () {
        yield bp.request({name: 'A', key: 2});
        yield bp.request({name: 'A', key: 1});
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
        enable(blockingThread());
        enable(requestingThread());
    }, ()=> {
        expect(advancedKey1).toEqual(false);
        expect(advancedKey2).toEqual(true);
    });
});


test("all events with a key can be blocked by a block without a key", () => {
    let advancedKey1 = false;
    let advancedKey2 = false;

    const thread1 = scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 1});
        advancedKey1 = true;
    });

    const thread2 = scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 2});
        advancedKey2 = true;
    });

    const blockingThread = scenario(null, function* () {
        yield bp.block('A');
    });

    const requestingThread = scenario(null, function* () {
        yield bp.request({name: 'A', key: 2});
        yield bp.request({name: 'A', key: 1});
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
        enable(blockingThread());
        enable(requestingThread());
    }, ()=> {
        expect(advancedKey1).toEqual(false);
        expect(advancedKey2).toEqual(false);
    });
});


test("a request without a key will advance waiting threads with a key", () => {
    let advancedWait1 = false;
    let advancedWait2 = false;

    const waitThreadWithKey1= scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 1});
        advancedWait1 = true;
    });

    const waitThreadWithKey2 = scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 2});
        advancedWait2 = true;
    });

    const requestThread = scenario(null, function* () {
        yield bp.request('A');
    });

    testScenarios((enable) => {
        enable(waitThreadWithKey1());
        enable(waitThreadWithKey2());
        enable(requestThread());
    }, ()=> {
        expect(advancedWait1).toEqual(true);
        expect(advancedWait2).toEqual(true);
    });
});


test("an request without a key will advance extends with a key", () => {
    let advancedExtend = false;

    const extending = scenario(null, function* () {
        yield bp.extend({name: 'A', key: 1});
        advancedExtend = true;
    });

    const requesting = scenario(null, function* () {
        yield bp.request('A');
    });

    testScenarios((enable) => {
        enable(extending());
        enable(requesting());
    }, ()=> {
        expect(advancedExtend).toEqual(true);
    });
});


test("a request with a key, will only advance the matching wait with the same key, and waits without a key", () => {
    let advancedWait1 = false;
    let advancedWait2 = false;
    let advancedWaitNoKey = false;

    const waitThreadWithKey1 = scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 1});
        advancedWait1 = true;
    });

    const waitThreadWithKey2= scenario(null, function* () {
        yield bp.askFor({name: 'A', key: 2});
        advancedWait2 = true;
    });

    const waitThreadWithoutKey = scenario(null, function* () {
        yield bp.askFor({name: 'A'});
        advancedWaitNoKey = true;
    });

    const requestThread = scenario(null, function* () {
        yield bp.request({name: 'A', key: 1});
    });

    testScenarios((enable) => {
        enable(waitThreadWithKey1());
        enable(waitThreadWithKey2());
        enable(waitThreadWithoutKey());
        enable(requestThread());
    }, ()=> {
        expect(advancedWait1).toEqual(true);
        expect(advancedWait2).toEqual(false);
        expect(advancedWaitNoKey).toEqual(true);

    });
});