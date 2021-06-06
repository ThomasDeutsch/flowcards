import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { scenario } from '../src/scenario';
import { Replay } from '../src/replay';

test("a replay can be started", (done) => {
    const thread1 = scenario({id: 's1'}, function* () {
        const bid = yield bp.askFor("A");
        expect(bid.payload).toBe(1);
        done();
    });

    const replay = new Replay({actions: [{id: 0, type: 'uiAction', payload: 1, eventId: {name: 'A'}}]})

    const [context, startReplay] = testScenarios((enable) => {
        enable(thread1());
    }, ({scenario}) => {
        if(replay.isCompleted) {
            expect(scenario.get('s1')?.isCompleted).toBe(true);
        }
    });

    startReplay(replay);
});

test("a running replay can be paused using a breakpoint", (done) => {
    const thread1 = scenario({id: 's1'}, function* () {
        let bid = yield bp.askFor("A");
        expect(bid.payload).toBe(1);
        bid = yield bp.askFor("B");
        expect(bid.payload).toBe(2);
        done();
    });

    const replay = new Replay({
        actions: [
            {id: 0, type: 'uiAction', payload: 1, eventId: {name: 'A'}},
            {id: 1, type: 'uiAction', payload: 2, eventId: {name: 'B'}}
        ],
        breakBefore: [1]
    })

    const [context, startReplay] = testScenarios((enable) => {
        enable(thread1());
    }, ({scenario}) => {
        if(replay.isPaused) {
            expect(scenario.get('s1')?.bids.askForBid?.has('B')).toBe(true);
            replay.resume();
        }
    });

    startReplay(replay);
});

