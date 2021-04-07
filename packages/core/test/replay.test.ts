import * as bp from "../src/index";
import { testScenarios, delay } from "./testutils";
import { scenario } from '../src/scenario';
import { ActionType, BidType } from "../src/index";

test("a set is a request, that will be cached. ", (done) => {
    const thread1 = scenario({id: 'flow1'}, function* () {
        const bid = yield bp.set("count", 2);
        if(bid.payload === 'replayPayload') {
            expect(bid.payload).toEqual('replayPayload');
            done();
        }
    })

    const [_, dispatch] = testScenarios((enable, ) => {
        enable(thread1());
    });
    dispatch({
        type: 'replay',
        actions: [{id: 0, type: ActionType.requested, eventId: {name: 'count'}, bidType: BidType.set, bThreadId: {name: 'flow1'}, payload: 'replayPayload'}]
    })
});


test("a set is a request, that will be cached.2 ", (done) => {
    const thread1 = scenario({id: 'flow1'}, function* () {
        const pl1 = yield bp.askFor("count");
        const pl2 = yield bp.askFor("count");
        expect(pl1.payload).toEqual('replayPayload1');
        expect(pl2.payload).toEqual('replayPayload2');
        done();
    })

    const [_, dispatch] = testScenarios((enable, ) => {
        enable(thread1());
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.ui, eventId: {name: 'count'}, payload: 'replayPayload1'},
            {id: 1, type: ActionType.ui, eventId: {name: 'count'}, payload: 'replayPayload2'}
        ]
    })
});

test("a set is a request, that will be cachedd.23j ", (done) => {
    const thread1 = scenario({id: 'flow1'}, function* () {
        const pl1 = yield bp.askFor("count1");
        const pl2 = yield bp.request("count2", 1);
        const pl3 = yield bp.askFor("count3");
        done();
    })

    const [_, dispatch] = testScenarios((enable) => {
        enable(thread1());
    },({debug}) => {
        if(debug.testResults.size) {
            expect(debug.testResults.size).toBe(1);
            expect(debug.isPaused).toBe(true);
            expect(debug.inReplay).toBe(false);
            expect(debug.currentActionId).toBe(2);
            done();
        }
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.ui, eventId: {name: 'count1'}, payload: 'replayPayload1'},
            {id: 2, type: ActionType.ui, eventId: {name: 'count2'}, payload: 'replayPayload3'}
        ]
    })
});



test("a set is a request, that will be ,cachedd.23j ", (done) => {
    const thread1 = scenario({id: 'flow1'}, function* () {
        const pl1 = yield bp.askFor("count1");
        const pl2 = yield bp.request("count2", 1);
        const pl3 = yield bp.askFor("count3");
        done();
    })

    const [_, dispatch] = testScenarios((enable) => {
        enable(thread1());
    },({debug}) => {
        if(debug.testResults.size) {
            expect(debug.testResults.size).toBe(1);
            expect(debug.isPaused).toBe(true);
            expect(debug.inReplay).toBe(false);
            expect(debug.currentActionId).toBe(2);
            done();
        }
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.ui, eventId: {name: 'count1'}, payload: 'replayPayload1'},
            {id: 2, type: ActionType.ui, eventId: {name: 'count2'}, payload: 'replayPayload3'}
        ],
    })
});


test("replay async event", (done) => {
    const thread1 = scenario({id: 'flow1'}, function* () {
        const bid = yield bp.set("count", () => delay(20, 'result'));
        if(bid.payload === 'replayPayload') {
            expect(bid.payload).toEqual('replayPayload');
            done();
        }
    })

    const [_, dispatch] = testScenarios((enable, ) => {
        enable(thread1());
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.requested, eventId: {name: 'count'}, bidType: BidType.set, bThreadId: {name: 'flow1'}, payload: () => delay(200, 1)},
            {id: 1, type: ActionType.resolved, eventId: {name: 'count'}, requestActionId: 0, pendingDuration: 20, resolvedRequestingBid: {eventId: {name: 'count'}, bThreadId: {name: 'flow1'}, type: BidType.set}, payload: 'replayPayload'}]
    })
});


test("replay async event, with mocked delay", (done) => {
    const thread1 = scenario({id: 'flow1'}, function* () {
        const bid = yield bp.set("count", () => delay(20, 'result'));
        if(bid.payload === 'replayPayload') {
            expect(bid.payload).toEqual('replayPayload');
            done();
        }
    })

    const [_, dispatch] = testScenarios((enable, ) => {
        enable(thread1());
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.requested, eventId: {name: 'count'}, bidType: BidType.set, bThreadId: {name: 'flow1'}, payload: () => delay(200, 'replayPayload')}]
    })
});


test("when a replay action for an async request is missing, the current bid payload of the BThread is used (api-calls are re-executed)", (done) => {
    let isCallExecuted = false;
    const thread1 = scenario({id: 'flow1'}, function* () {
        const bid = yield bp.set("count", () => {
            isCallExecuted = true;
            return delay(20, 'result')
        });
        expect(bid.payload).toEqual('result');
        expect(isCallExecuted).toBe(true);
        done();
    });

    const [_, dispatch] = testScenarios((enable, ) => {
        enable(thread1());
    });
    dispatch({
        type: 'replay',
        actions: [
            {id: 0, type: ActionType.requested, eventId: {name: 'count'}, bidType: BidType.set, bThreadId: {name: 'flow1'}}]
    })
});


test("breakpoints", (done) => {
    const thread1 = scenario({id: 'flow1'}, function* () {
        yield bp.request("event1");
        yield bp.request("event2");
        yield bp.request("event3");
        yield bp.request("event4");
    });

    const [_, dispatch] = testScenarios((enable, ) => {
        enable(thread1());
    },({debug, log})=> {
        if(log.actions.length === 2) {
            expect(debug.isPaused).toBe(true);
            done();

        }
    });
    dispatch({
        type: 'replay',
        breakpoints: new Set([2]),
        actions: [
            {id: 0, type: ActionType.requested, eventId: {name: 'event1'}, bidType: BidType.request, bThreadId: {name: 'flow1'}},
            {id: 1, type: ActionType.requested, eventId: {name: 'event2'}, bidType: BidType.request, bThreadId: {name: 'flow1'}},
            {id: 2, type: ActionType.requested, eventId: {name: 'event3'}, bidType: BidType.request, bThreadId: {name: 'flow1'}},
            {id: 3, type: ActionType.requested, eventId: {name: 'event4'}, bidType: BidType.request, bThreadId: {name: 'flow1'}}
        ]
    })
});