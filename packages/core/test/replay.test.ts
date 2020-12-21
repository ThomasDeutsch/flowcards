import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { ActionType, GET_VALUE_FROM_BTHREAD } from '../src/action';
import { scenario } from '../src/scenario';
import { BidType } from '../src/bid';
import { ScenariosContext } from '../src/update-loop';
import { ContextTest } from "../src";
import * as chai from "chai";

test("a thread can be replayed", (done) => {
    let value1: number, value2: number;
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor('HEY');
        value1 = yield bp.request("requestingEventA", () => delay(2000, 5));
        expect(value1).toBe(1); // not 5, because the replay-resolve value is 1
        value2 = yield bp.askFor("B");
    });
    const [_, dispatch] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(value1).toEqual(1);
            expect(value2).toEqual(3);
            done();
        }
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'HEY'}},
            {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'requestingEventA'}, bidType: BidType.request, payload: () => delay(100, 1)},
            {id: 2, type: ActionType.resolved, bThreadId: {name: 'thread1'}, eventId: {name: 'requestingEventA'}, bidType: BidType.request, payload: 1},
            {id: 3, type: ActionType.uiDispatched, bThreadId: {name: 'thread1'}, eventId: {name: 'B'}, payload: 3}
        ]
    });
});


test("if a request-replay has a GET_VALUE_FROM_BTHREAD symbol as payload, the b-threads payload will be used", (done) => {
    let value1: number;
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor('replayEvent1');
        value1 = yield bp.request("replayEvent2", 5);
    });
    const [context, dispatch] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(value1).toEqual(5);
            done();
        }
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
            {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'replayEvent2'}, payload: GET_VALUE_FROM_BTHREAD, bidType: BidType.request}
        ]
    });  
});


test("a async request can be replayed", (done) => {
    let value1: number;
    let eventReplayed = false;
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor('replayEvent1');
        value1 = yield bp.request("replayEvent2", () => {
            eventReplayed = true;
            return delay(100, 'YEAH');
        });
        yield bp.askFor('replayEvent3');
    });
    const [context, replay] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(value1).toEqual('YEAH');
            expect(eventReplayed).toBeTruthy();
            done();
        }
    });
    replay({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
            {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'replayEvent2'}, resolveActionId: 2, payload: GET_VALUE_FROM_BTHREAD, bidType: BidType.request},
            // the index:2 action is missing ... this is where the resolve will be placed.
            {id: 3, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent3'}}
        ]
    });
});


test("an extend can be replayed", (done) => {
    let value1: number;
    let eventReplayed = false;

    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor('replayEvent1');
        value1 = yield bp.request("replayEvent2", () => {
            eventReplayed = true;
            return delay(100, 'YEAH');
        });
        yield bp.askFor('replayEvent3');
    });

    const thread2 = scenario({id: 'thread2'}, function* () {
        const ext = yield bp.extend('replayEvent2');
        console.log('wait for replayEvent2a');
        yield bp.askFor('replayEvent2a');
        ext.resolve('SUPER');
    });

    const [context, replay] = testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({thread, debug, log}) => {
        console.log(log.actions);
        if(thread.get('thread1')?.isCompleted) {
            expect(value1).toEqual('SUPER');
            expect(eventReplayed).toBeTruthy();
            done();
        }
    });
    replay({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
            {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'replayEvent2'}, resolveActionId: 2, payload: GET_VALUE_FROM_BTHREAD, bidType: BidType.request},
            // the index:2 action is missing ... this is where the resolve will be placed.
            {id: 3, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent2a'}},
            {id: 4, type: ActionType.resolved, bThreadId: {name: 'thread1'}, eventId: {name: 'replayEvent2'}, payload: 'SUPER', bidType: BidType.extend},
            {id: 5, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent3'}}
        ]
    });
});


test("after a replay completes, the normal execution will resume", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor('replayEvent1');
        yield bp.request('requestEvent1');
        yield bp.request('requestEvent2');
    });
    const [context, dispatch] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(true).toEqual(true);
            done();
        }
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
            {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'requestEvent1'}, bidType: BidType.request}
        ]
    });
});


test("a replay can contain tests that will run before an action for that index is executed.", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor('replayEvent1');
        yield bp.request('requestEvent1');
        yield bp.request('requestEvent2');
    });
    const [context, dispatch] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(true).toEqual(true);
            done();
        }
    });
    const testMap = new Map<number, ContextTest[]>();
    testMap.set(0, [(context: ScenariosContext) => {
        expect(context.event('replayEvent1').validate().isValid).toBe(true);
        return true;
    }]);
    testMap.set(1, [(context: ScenariosContext) => {
        expect(context.event('replayEvent1').validate().isValid).toBe(false);
        return true;
    }]);    
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
            {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'requestEvent1'}, bidType: BidType.request}
        ],
        tests: testMap
    });
});



test("during a replay, the inReplay flag is true", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor('replayEvent1');
        yield bp.request('requestEvent1');
        yield bp.request('requestEvent2');
    });
    const [context, dispatch] = testScenarios((enable) => {
        enable(thread1());
    }, ({thread, debug}) => {
        if(thread.get('thread1')?.isCompleted) {
            expect(debug.inReplay).toEqual(false);
            done();
        }
    });
    const testMap = new Map<number, ContextTest[]>();
    testMap.set(0, [(context: ScenariosContext) => {
        expect(context.debug.inReplay).toBe(true);
        return true;
    }]);
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
            {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'requestEvent1'}, bidType: BidType.request}
        ],
        tests: testMap
    });
});



test("if a test fails, the execution will be paused", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor('replayEvent1');
        yield bp.request('requestEvent1');
        yield bp.request('requestEvent2');
    });
    const [context, dispatch] = testScenarios((enable) => {
        enable(thread1());
    }, ({debug}) => {
        if(debug.isPaused) {
            expect(debug.currentActionId).toBe(0);
            expect(debug.testResults.get(debug.currentActionId)[0]).toBeInstanceOf(chai.AssertionError);
            done();
        }
    });

    const testMap = new Map<number, ContextTest[]>();
    testMap.set(0, [() => {
        return chai.expect(1).to.equal(2);
    }]);
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
            {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'requestEvent1'}, bidType: BidType.request}
        ],
        tests: testMap
    });
});


test("results of a failed action-validation tests are found in the debugger.testResults map", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.askFor('replayEvent1');
        yield bp.request('requestEvent1');
        yield bp.request('requestEvent2');
    });
    const [context, dispatch] = testScenarios((enable) => {
        enable(thread1());
    }, ({debug}) => {
        if(debug.isPaused) {
            expect(debug.currentActionId).toBe(1);
            expect(debug.testResults.get(debug.currentActionId)[0].type).toBe('action-validation');
            expect(debug.testResults.get(debug.currentActionId)[0].message).toBe('BThreadWithoutMatchingBid');
            done();
        }
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.uiDispatched, bThreadId: {name: ''}, eventId: {name: 'replayEvent1'}},
            {id: 1, type: ActionType.requested, bThreadId: {name: 'thread1'}, eventId: {name: 'event-XX'}, bidType: BidType.request}
        ]
    });
});