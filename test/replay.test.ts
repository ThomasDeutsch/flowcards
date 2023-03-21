import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { request } from "../src/bid";
import { Scheduler, SchedulerCompletedCallback } from "../src/scheduler";
import { Replay, ReplayAction } from "../src/replay";
import { delay } from "./test-utils";


describe("the replay behavior", () => {

    test('a request can be replayed', (done) => {
        const eventA = new Event<number>('eventA');
        let requestProgressed = 0;

        const rootFlow = function*(this: Flow) {
            this.startFlow('subflow', function* () {
                yield request(eventA, requestProgressed);
                requestProgressed++;
            }, [])
            yield undefined;
        }
        const actions: ReplayAction<any>[] = [];
        const logAction: SchedulerCompletedCallback = (actionInfo) => {
            actionInfo.forEach(info => {
                if(info.processedAction) {
                    actions.push(info.processedAction);
                }
            });
        }
        let scheduler = new Scheduler({
            rootFlow,
            completedCB: logAction
        });
        expect(actions[0].eventId[0]).toBe(eventA.id[0]);
        const replay: Replay = {
            id: 'test',
            actions: actions
        };
        scheduler = new Scheduler({
            rootFlow,
            completedCB: logAction,
            replay
        });
        expect(requestProgressed).toBe(2);
        done();
    });


    test('an async request can be replayed', (done) => {
        const eventA = new Event<number>('eventA');
        let requestProgressed = 0;
        let replayStarted = false;
        let asyncCalled = 0;

        const rootFlow = function*(this: Flow) {
            this.startFlow('subflow', function* () {
                yield request(eventA, () => {
                    asyncCalled++;
                    return delay(100, 10)
                });
                requestProgressed++;
            }, [])
            yield undefined;
        }
        const actions: ReplayAction<any>[] = [];
        const logAction: SchedulerCompletedCallback = (actionInfo, _ , replay2) => {
            actionInfo.forEach(info => {
                if(info.processedAction) {
                    actions.push(info.processedAction);
                }
            });

            if(requestProgressed === 1 && !replayStarted) {
                replayStarted = true;
                scheduler.rootFlow.__end(true);
                eventA.__reset();
                expect(eventA.value).toBe(undefined);
                // start the replay
                expect(actions[0].eventId[0]).toBe(eventA.id[0]);
                expect(actions.length).toBe(2)
                const replay: Replay = {
                    id: 'test',
                    actions: [...actions]
                };
                scheduler = new Scheduler({
                    rootFlow,
                    completedCB: logAction,
                    replay
                });
            }

            if(requestProgressed === 2) {
                //expect(actionInfo[0]?.processedAction?.eventId[0]).toBe(eventA.id[0]);
                expect(replay2.state).toBe('completed');
                expect(eventA.value).toBe(10);
                expect(asyncCalled).toBe(2);
                done();
            }
        }

        let scheduler = new Scheduler({
            rootFlow,
            completedCB: logAction
        });
    });

    test('an async request can be replayed - with mock data', (done) => {
        const eventA = new Event<number>('eventA');
        let requestProgressed = 0;
        let replayStarted = false;
        let asyncCalled = 0;

        const rootFlow = function*(this: Flow) {
            this.startFlow('subflow', function* () {
                yield request(eventA, () => {
                    asyncCalled++;
                    return delay(100, 10)
                });
                requestProgressed++;
            }, [])
            yield undefined;
        }
        const actions: ReplayAction<any>[] = [];
        const logAction: SchedulerCompletedCallback = (actionInfo, _ , replay) => {
            actionInfo.forEach(info => {
                const action = info.processedAction;
                if(action === undefined) return;
                if(action.type === 'requestedAsync') {
                    action.payload === '__%TAKE_PAYLOAD_FROM_BID%__';
                    action.resolveRejectAction = {resolveActionId: 1};
                }
                actions.push(action);
            });

            if(requestProgressed === 1 && !replayStarted) {
                replayStarted = true;
                scheduler.rootFlow.__end(true);
                eventA.__reset();
                expect(eventA.value).toBe(undefined);
                // start the replay
                expect(actions[0].eventId[0]).toBe(eventA.id[0]);
                expect(actions.length).toBe(2)
                const replay: Replay = {
                    id: 'test',
                    actions: [...actions]
                };
                scheduler = new Scheduler({
                    rootFlow,
                    completedCB: logAction,
                    replay
                });
            }

            if(replay.state === 'completed') {
                //expect(actionInfo[0]?.processedAction?.eventId[0]).toBe(eventA.id[0]);
                //expect(replay.state).toBe('completed');
                expect(eventA.value).toBe(10);
                expect(asyncCalled).toBe(1);
                done();
            }
        }

        let scheduler = new Scheduler({
            rootFlow,
            completedCB: logAction
        });
    });
})