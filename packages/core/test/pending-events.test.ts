import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { flow } from '../src/scenario';
import { ActionType } from '../src/action';



function delay(ms: number, value?: any) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

test("a pending event can not be requested by another thread", () => {
    const thread1 = flow({name: 'thread1'}, function* () {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    });

    const thread2 = flow({name: 'thread2'}, function* () {
        yield bp.request("A", "hey");
    });

    testScenarios((enable) => {
        enable(thread2());
        enable(thread1());
    }, ({event, thread}) => {
        expect(event('A').isPending).toBeTruthy();
        expect(thread.get('thread2')?.isCompleted).toBeFalsy();
    });
});


test("a pending event can not be extended", () => {
    const thread1 = flow({name: 'thread1'}, function* () {
        while (true) {
            yield bp.request("A", () => delay(1000));
        }
    });

    const thread2 = flow({name: 'thread2'}, function* () {
        yield bp.extend("A");
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event}) => {
        expect(event('A').isPending).toBeTruthy();
    });
});


test("a pending event resolves can not be blocked", done => {
    const thread1 = flow({name: 'thread1'}, function* () {
        yield bp.request("A", () => delay(500));
        yield bp.askFor("fin");
    });

    const thread2 = flow(null, function* () {
        yield bp.request("B", () => delay(200));
        yield bp.block("A");
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event}) => {
        if(event('fin').dispatch) {
            expect(1).toBe(1);
            done();
        }
    });
});



test("pending events can not be dispatched", done => {
    const thread1 = flow(null, function* () {
        yield bp.request("A", () => delay(500));
    });

    const thread2 = flow(null, function* () {
        yield bp.askFor("A");
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event}) => {
            if(event('A')) {
                expect(event("A").dispatch).toBeUndefined();
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

    const thread2 = flow({name: 't2'}, function* (): any  {
        const [event] = yield [bp.askFor('A'), bp.request("C", () => delay(400))];
        expect(event.name).toBe("C");
        
    })

    testScenarios((enable) => {
        enable(threadOne());
        enable(thread2());
    }, ({log, thread}) => {
        if(thread.get('t2')?.isCompleted) {
            expect(log.actions.filter(a => a.type === ActionType.request).length).toBe(3);
            expect(log.actions.filter(a => a.type === ActionType.resolve).length).toBe(2); // 3 requested, but only 2 resolved because 1 got cancelled
            done();
        }
    });
});



function rejectedPromise(ms: number, errorMsg: string) {
    return new Promise((_, reject) => setTimeout(() => reject(errorMsg), ms));
}

test("rejected pending events will not progress waiting BThreads", done => {
    let thread1Progressed = false;
    let wasCatched = false;
    const thread1 = flow({name: 'waitingThread'}, function* () {
        yield bp.askFor("A"); 
        thread1Progressed = true;
    });

    const thread2 = flow({name: 'requestingThread'}, function* () {
        try{
            yield bp.request("A", () => rejectedPromise(1, 'error message'));
        } catch(e) {
            wasCatched = true;
            expect(e.event.name).toBe('A');
            expect(e.error).toBe('error message');
        }
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({thread}) => {
        if(thread.get({name: 'requestingThread'})?.isCompleted) {
            expect(wasCatched).toBe(true);
            expect(thread1Progressed).toBe(false);
            done(); 
        }
    });
});

test("if a pending event is rejected, the lower-prio thread will use its request instead", done => {
    const thread1 = flow(null, function* () {
        const val = yield bp.request("A", 1);
        expect(val).toBe(1);
        done(); 
    });

    const thread2 = flow(null, function* () {
        try{
            yield bp.request("A", () => rejectedPromise(1, 'error details'));
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
        yield bp.askFor("A");
        yield bp.askFor('fin');
    });

    testScenarios((enable) => {
        enable(thread1());
        enable(thread2());
    }, ({event}) => {
        if(event("fin").dispatch) {
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
