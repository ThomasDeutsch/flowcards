import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { BThreadContext, BThreadState } from '../src/bthread';
import { scenario } from '../src/scenario';

test("a thread will accept an optional array of arguments", () => {
    let receivedArgs = ["", "", ""];
    interface MyProps {a: string; b: string; c: string}

    const thread = scenario(null, function* (props: MyProps) {
        receivedArgs = [props.a, props.b, props.c];
        yield bp.askFor('event');
    })

    testScenarios((enable) => {
        enable(thread({a: 'A', b: 'B', c: 'C'}));
    });
    expect(receivedArgs[0]).toBe("A");
    expect(receivedArgs[1]).toBe("B"); 
    expect(receivedArgs[2]).toBe("C"); 
});


test("a thread will accept an optional key", () => {
    let receivedKeyA, receivedKeyB;

    const thread = scenario(null, function* (this: BThreadContext) {
        receivedKeyA = this.key;
        yield bp.askFor('A');
    });

    const threadB = scenario({id: 'thread2'}, function* (this: BThreadContext) {
        receivedKeyB = this.key;
        yield bp.askFor('A');
    });

    testScenarios((enable) => {
        enable(thread(undefined), 0);
        enable(threadB(undefined),'foo');
    }, ({thread}) => {
        expect(thread.get({name: 'thread2', key: 'foo'})?.id.key).toBe('foo'); // BThreadState will contain the BThreadKey
    });

    expect(receivedKeyA).toBe(0); 
    expect(receivedKeyB).toBe("foo");
});



test("if no key is provided, the default key value is undefined", () => {
    let receivedKeyA;

    const thread = scenario(null, function* (this: BThreadContext) {
        receivedKeyA = this.key;
        yield bp.askFor('A');
    });

    testScenarios((enable) => {
        enable(thread());
    });

    expect(receivedKeyA).toBeUndefined(); 
});

test("enable will return the current thread waits", () => {
    let threadState: BThreadState;

    const thread = scenario(null, function* (this: BThreadContext) {
        yield bp.askFor('A');
    });

    testScenarios((enable) => {
        threadState = enable(thread());
        expect(threadState?.bids.askForBid?.has('A')).toBe(true);
    });
});


test("enable will return the current thread blocks", () => {
    let threadState: BThreadState;

    const thread = scenario(null, function* (this: BThreadContext) {
        yield bp.block('A');
    });

    testScenarios((enable) => {
        threadState = enable(thread());
        expect(threadState?.bids?.blockBid?.has('A')).toBe(true);
    });
});


test("enable will return the current thread-section", () => {
    let threadState: BThreadState;

    const thread = scenario(null, function* (this: BThreadContext) {
        this.section('my state value');
        yield bp.askFor('A');
    });

    testScenarios((enable) => {
        threadState = enable(thread());
        expect(threadState?.section).toEqual('my state value');
    });
});


test("enable will return the the state of completion", () => {
    let threadState: BThreadState;

    const thread = scenario(null, function* (this: BThreadContext) {
        this.section('my state value');
        yield bp.request('A');
    });

    testScenarios((enable) => {
        threadState = enable(thread());
    }, () => {
        expect(threadState?.isCompleted).toEqual(true);
    });
});

test("the section will be deleted if the thread completes", () => {
    let threadState: BThreadState;

    const thread = scenario(null, function* (this: BThreadContext) {
        this.section('my state value');
        yield bp.request('A');
    });

    testScenarios((enable) => {
        threadState = enable(thread());
    }, () => {
        expect(threadState?.isCompleted).toEqual(true);
        expect(threadState?.section).toBeUndefined();
    });
});


test("enable will return the current pending events and a pending function", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield [bp.request("A", delay(100)), bp.request("B", delay(100))];
    });

    let enableReturn: BThreadState;

    testScenarios((enable) => {
        enableReturn = enable(thread1());
    }, ({event}) => {
        if(event('A').isPending && event('B').isPending) {
            expect(enableReturn.bids?.requestBid?.has('A')).toBeTruthy();
            expect(enableReturn.bids?.requestBid?.has('B')).toBeTruthy();
            done();
        }
    });
});

test("enable will return the current requesting events ( blocked and pending included )", (done) => {
    const thread1 = scenario({id: 'thread1'}, function* () {
        yield [bp.request("A", delay(100)), bp.request("B")];
    });

    const thread2 = scenario(null, function*() {
        yield bp.block('B');
    })

    let enableReturn: BThreadState;

    testScenarios((enable) => {
        enableReturn = enable(thread1());
        enable(thread2());
    }, ({event}) => {
        if(event('A').isPending) {
            expect(enableReturn.bids?.requestBid?.has('A')).toBeTruthy();
            expect(enableReturn.bids?.requestBid?.has('B')).toBeTruthy();
            done();
        }
    });
});


test("a BThread is destroyed, if the flow is not enabled and the destroy-flag is set to true", (done) => {
    let thread2init = 0;
    let thread1init = 0;

    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.request("B");
        yield bp.request('X');
        yield bp.askFor("FIN");
    });

    const thread2 = scenario({id: 'thread2', destroyOnDisable: true}, function*() {
        thread2init++
        yield bp.askFor('B');
        yield bp.askFor('C');
    })

    const thread3 = scenario({id: 'thread3', destroyOnDisable: false}, function*() {
        thread1init++
        yield bp.askFor('B');
        yield bp.askFor('C');
    })

    testScenarios((enable) => {
        const enableReturn = enable(thread1());
        if(enableReturn.bids?.requestBid?.has('B') || enableReturn.bids?.askForBid?.has('FIN')) {
            enable(thread2());
            enable(thread3());
        }
    }, ({event, thread}) => {
        if(event('B').dispatch) {
            expect(thread1init).toBe(1);
            expect(thread2init).toBe(2);
            expect(thread.get('thread3')?.bids?.askForBid?.has('C')).toBeTruthy();
            expect(thread.get('thread2')?.bids?.askForBid?.has('B')).toBeTruthy();
            done();
        }
    });
});