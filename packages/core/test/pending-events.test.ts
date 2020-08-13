import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { ActionType } from '../src/action';
import { flow } from '../src/flow';



function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

test("a pending event can be requested by another thread", () => {
    const thread1 = flow({id: 'thread1'}, function* () {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    });

    const thread2 = flow({id: 'thread2'}, function* () {
        yield bp.request("A", "hey");
    });

    testScenarios((enable) => {
        enable(thread2());
        enable(thread1());
    }, ({pending, state}) => {
        expect(pending.has('A')).toBeTruthy();
        expect(state['thread2'].isCompleted).toBeTruthy();
    });
});


test("a pending event can not be extended", () => {
    const thread1 = flow({id: 'thread1'}, function* () {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    });

    const thread2 = flow({id: 'thread2'}, function* () {
        yield bp.extend("A");
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({log, pending}) => {
        expect(pending.has('A')).toBeTruthy();
        expect(log?.latestAction.threadId).toBe("thread1");
    });
});


test("a pending event resolves can not be blocked", done => {
    const thread1 = flow({id: 'thread1'}, function* () {
        yield bp.request("A", () => delay(500));
        yield bp.wait("fin");
    });

    const thread2 = flow(null, function* () {
        yield bp.request("B", () => delay(200));
        yield bp.block("A");
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({log, dispatch}) => {
        if(dispatch('fin')) {
            expect(log?.latestAction.threadId).toBe("thread1");
            expect(log?.latestAction.type).toBe(ActionType.resolved);
            done();
        }
    });
});



test("pending events can be dispatched if there is a wait for the same event.", done => {
    const thread1 = flow(null, function* () {
        yield bp.request("A", () => delay(500));
    });

    const thread2 = flow(null, function* () {
        yield bp.wait("A");
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({dispatch, pending}) => {
            if(pending.has('A')) {
                expect(dispatch("A")).toBeDefined();
                done();
            }
    });
});

test("After a pending event is resolved, a BThread that has requested this event is progressed", done => {
    const threadOne = flow(null, function* () {
        yield bp.request("singleAsyncRequest", () => delay(100));
        expect(1).toBe(1);
        done();
    });

    testScenarios((enable) => {
        enable(threadOne());
    });
});


test("If one pending-event is resolved, other promises for this event are cancelled", done => {
    const threadOne = flow(null, function* (): any {
        const [event] = yield [bp.request("A", () => delay(300)), bp.request("B", () => delay(1))];
        expect(event.name).toBe("B");
        done();
    });

    const thread2 = flow(null, function* (): any  {
        const [event] = yield [bp.wait('A'), bp.request("C", () => delay(400))];
        expect(event.name).toBe("C");
        done();
    })

    testScenarios((enable) => {
        enable(threadOne());
        enable(thread2());
    });
});



function rejectedPromise(ms: number) {
    return new Promise((_, reject) => setTimeout(() => reject(2), ms));
}

test("rejected pending events will not progress waiting BThreads", done => {
    const thread1 = flow(null, function* () {
        const val = yield bp.request("A", 1);
        expect(val).toBe(1);
        done();  
    });

    const thread2 = flow(null, function* () {
        try{
            yield bp.request("A", () => rejectedPromise(1));
        } catch(e) {
            //no op
        }
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    });
});

test("if a pending event is rejected, the lower thread will use its request instead", done => {
    const thread1 = flow(null, function* () {
        const val = yield bp.request("A", 1);
        expect(val).toBe(1);
        done(); 
    });

    const thread2 = flow(null, function* () {
        try{
            yield bp.request("A", () => rejectedPromise(1));
        } catch(e) {
            //no op
        }
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    });
});

test("if a threads waits for an already existing pending-event, it will also progress when the event is resolved", done => {
    const thread1 = flow(null, function* () {
        yield bp.request("A", () => delay(500));
    });

    const thread2 = flow(null, function* () {
        yield bp.request("Y", () => delay(100));
        yield bp.wait("A");
        yield bp.request('fin');
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({log}) => {
        if(log?.latestAction.event.name === "fin") {
            expect(1).toBeTruthy();
            done();
        }
    });
});

test("if a threads extends an already existing pending-event, it will trigger that extend when the event resolve", done => {
    let thread1Progressed = false;
    const thread1 = flow(null, function* () {
        yield bp.request("A", () => delay(500, 'requestedValue'));
        thread1Progressed = true;  
    });

    const thread2 = flow(null, function* () {
        yield bp.request("Y", () => delay(100));
        const extend = yield bp.extend("A");
        expect(extend.value).toBe('requestedValue');
        
        expect(thread1Progressed).toBe(false);
        done();
    });
    
    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    });
});
