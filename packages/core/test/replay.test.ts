import * as bp from "../src/bid";
import { testScenarios } from "./testutils";
import { scenario } from '../src/scenario';
import { Replay } from '../src/replay';
import { BThreadContext } from "../src";

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


test("after the replay completed, a callback-function is called", (done) => {
    const thread1 = scenario({id: 's1'}, function* () {
        const bid = yield bp.askFor("A");
        expect(bid.payload).toBe(1);
    });

    const replay = new Replay({actions: [{id: 0, type: 'uiAction', payload: 1, eventId: {name: 'A'}}]}, () => {
        expect(1).toBe(1);
        done();
    })

    const [_, startReplay] = testScenarios((enable) => {
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







export function delay(ms: number, value?: any): Promise<any> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
  }

  const flow1 = scenario(
    {
      id: "Scenario 1 - user login", description: "user can sign in / out"
    },
    function*(this: BThreadContext) {
      while(true) {
        this.section('login process');
        const bid = yield bp.askFor("login", (value: string) => ({isValid: value !== undefined && value.length > 3, details: 'user-name needs more than 3 characters'}));
        yield bp.request("loginUser", () => delay(5000, bid.payload));
        yield bp.set("userLoggedIn", bid.payload);
        this.section('user logged in');
        yield bp.askFor('logout');
      }
    }
  );

  const flow2 = scenario(
    {
      id: "Scenario 2 - reserve ticket",
      description: "user can reserve a ticket"
    },
    function*(this: BThreadContext) {
      this.section('product-list');
      let bid = yield bp.askFor('select ticket', (value: number) => ({isValid: value !== undefined && value > 0 && value <= 10, details: 'ticket id between 0 and 10'}));
      yield bp.request('get ticket details', () => delay(2000, 'ticket details'));
      this.section('ticket-details: ' + bid.payload);
      bid = yield [bp.askFor('reserve ticket'), bp.askFor('back to product-list')];
      if(bid.eventId.name === 'reserve ticket') {
        yield bp.request('api reserve ticket', () => delay(2000));
        yield bp.set('ticket reserved');
      }
    }
  );

  const flow3 = scenario(
    {
      id: "Scenario 3 - user name restricted",
      description: "user name can not be longer than 10 characters"
    },
    function*(this: BThreadContext) {
      yield bp.validate('login', (value: string) => ({isValid: value?.length < 10, details: 'user-name needs to smaller chan 10 characters'}));
    }
  )

  const flow4 = scenario(
    {
      id: "Scenario 4 - confirm reservation",
      description: "user needs to confirm ticket-reservation"
    },
    function*(this: BThreadContext) {
      const e = yield bp.extend('reserve ticket');
      yield bp.askFor('confirm reservation');
      e.resolve!('ok');
    }
  )

  const replay = new Replay({
    actions: [
        {
          "type": "uiAction",
          "eventId": {
            "name": "login"
          },
          "payload": "Thomas",
          "id": 0
        },
        {
          "id": 1,
          "type": "requestedAction",
          "bidType": "requestBid",
          "bThreadId": {
            "name": "Scenario 1 - user login"
          },
          "eventId": {
            "name": "loginUser"
          },
          "resolveActionId": 2
        },
        {
          "id": 2,
          "type": "resolveAction",
          "eventId": {
            "name": "loginUser"
          },
          "payload": "Thomas",
          "requestActionId": 1,
          "pendingDuration": 5010,
          "resolvedRequestingBid": {
            "type": "requestBid",
            "bThreadId": {
              "name": "Scenario 1 - user login"
            }
          }
        },
        {
          "id": 3,
          "type": "requestedAction",
          "bidType": "setBid",
          "bThreadId": {
            "name": "Scenario 1 - user login"
          },
          "eventId": {
            "name": "userLoggedIn"
          }
        },
        {
          "type": "uiAction",
          "eventId": {
            "name": "select ticket"
          },
          "payload": "1",
          "id": 4
        },
        {
          "id": 5,
          "type": "requestedAction",
          "bidType": "requestBid",
          "bThreadId": {
            "name": "Scenario 2 - reserve ticket"
          },
          "eventId": {
            "name": "get ticket details"
          },
          "resolveActionId": 6
        },
        {
          "id": 6,
          "type": "resolveAction",
          "eventId": {
            "name": "get ticket details"
          },
          "payload": "ticket details",
          "requestActionId": 5,
          "pendingDuration": 2001,
          "resolvedRequestingBid": {
            "type": "requestBid",
            "bThreadId": {
              "name": "Scenario 2 - reserve ticket"
            }
          }
        },
        {
          "type": "uiAction",
          "eventId": {
            "name": "reserve ticket"
          },
          "id": 7
        },
        {
          "type": "uiAction",
          "eventId": {
            "name": "confirm reservation"
          },
          "id": 8
        },
        {
          "id": 9,
          "type": "resolvedExtendAction",
          "eventId": {
            "name": "reserve ticket"
          },
          "payload": "ok",
          "extendingBThreadId": {
            "name": "Scenario 4 - confirm reservation"
          },
          "requestActionId": 7,
          "pendingDuration": 2663
        },
        {
          "id": 10,
          "type": "requestedAction",
          "bidType": "requestBid",
          "bThreadId": {
            "name": "Scenario 2 - reserve ticket"
          },
          "eventId": {
            "name": "api reserve ticket"
          },
          "resolveActionId": 11
        },
        {
          "id": 11,
          "type": "resolveAction",
          "eventId": {
            "name": "api reserve ticket"
          },
          "requestActionId": 10,
          "pendingDuration": 2000,
          "resolvedRequestingBid": {
            "type": "requestBid",
            "bThreadId": {
              "name": "Scenario 2 - reserve ticket"
            }
          }
        },
        {
          "id": 12,
          "type": "requestedAction",
          "bidType": "setBid",
          "bThreadId": {
            "name": "Scenario 2 - reserve ticket"
          },
          "eventId": {
            "name": "ticket reserved"
          }
        }
      ]
})

  test("a complex app can be replayed", (done) => {
    const [context, startReplay] = testScenarios((enable) => {
        const isUserLoggedIn = enable(flow1()).section === ('user logged in');
        if(isUserLoggedIn) {
          enable(flow2());
          enable(flow4())
        } else {
          enable(flow3());
        }
      }, () => {
          if(replay.isRunning) {
              console.log('TEST: ')
          }
        if(replay.isCompleted) {
            expect(2).toBe(2);
            done();
            replay.resume();
        }
    });

    startReplay(replay);
});
