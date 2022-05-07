import { Flow } from "../src/flow";
import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { FlowEvent, RequestedAction } from "../src";
import { Replay } from "../src/replay";

test("a request can be replayed", (done) => {
    const basicEvent = {
        eventA: new FlowEvent<number>('A')
    }

    const requestingFlow = new Flow('thread1', function*() {
        yield bp.request(basicEvent.eventA, 1);
    });

    const replayAction: RequestedAction = {
        id: 0,
        type: 'requestedAction',
        eventId: {name: 'A'},
        payload: 1,
        flowId: {name: 'thread1'},
        bidId: 0
    }

    const replayObj = new Replay([replayAction]);

    testScenarios((enable) => {
        enable(requestingFlow);
    }, [basicEvent.eventA], ({replay}) => {
        expect(replay!.state === 'completed').toBe(true);
        done();
    }, replayObj)
});