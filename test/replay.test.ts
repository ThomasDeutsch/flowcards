import { Flow } from "../src/flow";
import { Event } from "../src/event";
import { request } from "../src/bid";
import { Scheduler, SchedulerCompletedCallback } from "../src/scheduler";
import { Replay, ReplayAction } from "../src/replay";


describe("the replay behavior", () => {

    test('an askFor can be replayed', (done) => {
        const eventA = new Event<number>('eventA');
        let requestProgressed = 0;

        const rootFlow = function*(this: Flow) {
            this.flow(function* () {
                yield request(eventA, requestProgressed);
                requestProgressed++;
            })
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
})