import { Scenario } from "../src";
import * as bp from "../src/bid";
import { ScenarioEvent } from "../src/scenario-event";
import { testScenarios } from "./testutils";

test("if a request replay has no payload, the Payload-Function will be called", () => {

    const basicEvent = {
        eventA: new ScenarioEvent<number>('A')
    }

    const requestingThread = new Scenario('requestingThread', function*() {
        let isCalled = false;
        const n = yield* bp.bid(bp.request(basicEvent.eventA, () => {
            isCalled = true;
            return 1;
        }));
        expect(isCalled).toBe(true);
        expect(n).toBe(1);
    });

    testScenarios((s, e) => {
        e(basicEvent);
        s(requestingThread);
    }, ({replay}) => {
        expect(replay?.state === 'completed').toBe(true);
    }, [
        {
          id: 0,
          type: 'requestedAction',
          bidType: 'requestBid',
          bThreadId: { name: 'requestingThread', key: undefined },
          eventId: { name: 'A' },
          //payload: 1
        }
      ]);
});

test("a request can be replayed with an alternative payload", () => {

    const basicEvent = {
        eventA: new ScenarioEvent<number>('A'),
        eventB: new ScenarioEvent<number>('B'),
        eventC: new ScenarioEvent<number>('C'),
        eventD: new ScenarioEvent('D')
    }

    const requestingThread = new Scenario('requestingThread', function*() {
        let isCalled = false;
        const n = yield* bp.bid(bp.request(basicEvent.eventC, () => {
            isCalled = true;
            return 1;
        }));
        expect(isCalled).toBe(false);
        expect(n).toBe(1000); // a value from a replay.
    });


    testScenarios((s, e) => {
        e(basicEvent);
        s(requestingThread);
    }, ({replay}) => {
        expect(replay?.state === 'completed').toBe(true);
    }, [
        {
          id: 0,
          type: 'requestedAction',
          bidType: 'requestBid',
          bThreadId: { name: 'requestingThread', key: undefined },
          eventId: { name: 'C' },
          payload: 1000 // payload override
        }
      ]);
});


test("a replay will fail, if the requested event is not the same event as the replay event.", () => {

    const basicEvent = {
        eventA: new ScenarioEvent<number>('A'),
        eventB: new ScenarioEvent<number>('B'),
        eventC: new ScenarioEvent<number>('C'),
        eventD: new ScenarioEvent('D')
    }

    const requesting = new Scenario('requestingThread', function*() {
        yield bp.request(basicEvent.eventA, 1);
    });

    const secondRequesting = new Scenario('secondRequesting', function*() {
        yield [bp.request(basicEvent.eventB, 1), bp.block(basicEvent.eventA)];
    });


    testScenarios((s, e) => {
        e(basicEvent);
        s(requesting);
        s(secondRequesting);
    }, ({replay}) => {
        expect(replay?.state === 'aborted').toBe(true);
        expect(replay?.abortInfo?.action.id).toBe(0);
    }, [
        {
          id: 0,
          type: 'requestedAction',
          bidType: 'requestBid',
          bThreadId: { name: 'requestingThread', key: undefined },
          eventId: { name: 'A' },
          payload: 1000 // payload override
        }
      ]);
});


test("if a ui replay action is found, without a matching askFor bid, the replay will be aborted", () => {

    const basicEvent = {
        eventA: new ScenarioEvent<number>('A')
    }

    const waitingThread = new Scenario('waitingThread', function*() {
        yield bp.waitFor(basicEvent.eventA); // not asking for event
    });

    testScenarios((s, e) => {
        e(basicEvent);
        s(waitingThread);
    }, ({replay}) => {
        expect(replay?.state === 'aborted').toBe(true);
        expect(replay?.abortInfo?.error).toBe('event can not be dispatched');
    }, [
        {
          id: 0,
          type: 'uiAction',
          eventId: { name: 'A' },
          bThreadId: { name: 'waitingThread' },
          payload: 1
        }
    ]);
});
