import { Flow } from "flow";
import * as bp from "../src/bid";
import { FlowEvent } from "../src/event-core";
import { testScenarios } from "./testutils";

test("if a request replay has no payload, the Payload-Function will be called", () => {

    const basicEvent = {
        eventA: new FlowEvent<number>('A')
    }

    const requestingThread = new Flow('requestingThread', function*() {
        let isCalled = false;
        const n = yield* bp.bid(bp.request(basicEvent.eventA, () => {
            isCalled = true;
            return 1;
        }));
        expect(isCalled).toBe(true);
        expect(n).toBe(1);
    });

    testScenarios((s) => {
        s(requestingThread);
    }, basicEvent, ({replay}) => {
        expect(replay?.state === 'completed').toBe(true);
    }, [
        {
          id: 0,
          type: 'requestedAction',
          flowId: { name: 'requestingThread', key: undefined },
          eventId: { name: 'A' }
        }
      ]);
});

test("a request can be replayed with an alternative payload", () => {

    const basicEvent = {
        eventA: new FlowEvent<number>('A'),
        eventB: new FlowEvent<number>('B'),
        eventC: new FlowEvent<number>('C'),
        eventD: new FlowEvent('D')
    }

    const requestingThread = new Flow('requestingThread', function*() {
        let isCalled = false;
        const n = yield* bp.bid(bp.request(basicEvent.eventC, () => {
            isCalled = true;
            return 1;
        }));
        expect(isCalled).toBe(false);
        expect(n).toBe(1000); // a value from a replay.
    });


    testScenarios((s) => {
        s(requestingThread);
    }, basicEvent, ({replay}) => {
        expect(replay?.state === 'completed').toBe(true);
    }, [
        {
          id: 0,
          type: 'requestedAction',
          flowId: { name: 'requestingThread', key: undefined },
          eventId: { name: 'C' },
          payload: 1000 // payload override
        }
      ]);
});


test("a replay will fail, if the requested event is not the same event as the replay event.", () => {

    const basicEvent = {
        eventA: new FlowEvent<number>('A'),
        eventB: new FlowEvent<number>('B'),
        eventC: new FlowEvent<number>('C'),
        eventD: new FlowEvent('D')
    }

    const requesting = new Flow('requestingThread', function*() {
        yield bp.request(basicEvent.eventA, 1);
    });

    const secondRequesting = new Flow('secondRequesting', function*() {
        yield [bp.request(basicEvent.eventB, 1), bp.validate(basicEvent.eventA, () => false)];
    });


    testScenarios((s) => {
        s(requesting);
        s(secondRequesting);
    }, basicEvent, ({replay}) => {
        expect(replay?.state === 'aborted').toBe(true);
        expect(replay?.abortInfo?.action.id).toBe(0);
    }, [
        {
          id: 0,
          type: 'requestedAction',
          flowId: { name: 'requestingThread', key: undefined },
          eventId: { name: 'A' },
          payload: 1000 // payload override
        }
      ]);
});


// test("if a ui replay action is found, without a matching askFor bid, the replay will be aborted", () => {

//     const basicEvent = {
//         eventA: new FlowEvent<number>('A')
//     }

//     const waitingThread = new Flow('waitingThread', function*() {
//         yield bp.waitFor(basicEvent.eventA); // not asking for event
//     });

//     testScenarios((s, e) => {
//         e(basicEvent);
//         s(waitingThread);
//     }, ({replay}) => {
//         expect(replay?.state === 'aborted').toBe(true);
//         expect(replay?.abortInfo?.error).toBe('event can not be dispatched');
//     }, [
//         {
//           id: 0,
//           type: 'uiAction',
//           eventId: { name: 'A' },
//           flowId: { name: 'waitingThread' },
//           payload: 1
//         }
//     ]);
// });
