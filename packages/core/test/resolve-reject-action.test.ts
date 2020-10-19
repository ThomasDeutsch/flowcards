import * as bp from "../src/bid";
import { Action, ActionType } from '../src/action';
import { UpdateLoop, StagingFunction } from '../src/update-loop';
import { flow } from '../src/scenario';


function rejectedDelay(ms: number) {
    return new Promise((resolve, reject) => setTimeout(() => reject('reject reason'), ms));
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms)).then(() => 'data');
}

test("when a promise is resolved, it will dispatch an Action.", done => {
    const testLoop = (enable: StagingFunction): void => {
        const loop = new UpdateLoop(enable, (action: Action) => {
            if(action) {
                loop.actionQueue.push(action)
                expect(action.type).toBe(ActionType.resolved);
                expect(action.bThreadId.name).toBe('thread1');
                expect(action.eventId.name).toBe('A');
                expect(action.payload).toBe('data');
            }
            loop.setupContext();
        });
        loop.setupContext();
    };

    const thread1 = flow({name: 'thread1'}, function* () {
        yield bp.request("A", delay(100));
        done();
    });

    testLoop((enable) => {
        enable(thread1());
    });
});


describe('dispatched action', () => {

    const testLoop = (enable: StagingFunction): void => {
        const loop = new UpdateLoop(enable, (action: Action) => {
            if(action) {
                loop.actionQueue.push(action);
                loop.setupContext();
            }
        });
        loop.setupContext();
    };

    test("A promise that throws an error, will continue. The error object will contain the reason and the eventId", done => {
        const thread1 = flow(null, function* () {
            let catched = false;
            try {
                yield bp.request("A", rejectedDelay(1));
            }
            catch (e) {
                catched = true;
                expect(e.event.name).toBe('A');
                expect(e.error).toBe('reject reason');
            }       
            expect(catched).toBe(true);
            done();
        });

        testLoop((enable) => {
            enable(thread1());
        });    
    });
});