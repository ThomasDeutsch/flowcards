import * as bp from "../src/bid";
import { Action, ActionType } from '../src/action';
import { UpdateLoop } from '../src/update-loop';
import { scenario } from '../src/scenario';
import { StagingFunction } from '../src/scaffolding';


function rejectedDelay(ms: number) {
    return new Promise((resolve, reject) => setTimeout(() => reject('reject reason'), ms));
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms)).then(() => 'data').catch(error => console.error(error));
}

test("when a promise is resolved, it will dispatch an Action.", done => {
    const testLoop = (enable: StagingFunction): void => {
        const updateLoop = new UpdateLoop(enable, (action: Action) => {
            if(action) {
                updateLoop.setUiActionQueue([action]);
                expect(action.type).toBe(ActionType.resolved);
                expect(action.bThreadId.name).toBe('thread1');
                expect(action.eventId.name).toBe('A');
                expect(action.payload).toBe('data');
            }
            updateLoop.runScaffolding();
        });
        updateLoop.runScaffolding();
    };

    const thread1 = scenario({id: 'thread1'}, function* () {
        yield bp.request("A", delay(100));
        done();
    });

    testLoop((enable) => {
        enable(thread1());
    });
});


describe('dispatched action', () => {

    const testLoop = (enable: StagingFunction): void => {
        const updateLoop = new UpdateLoop(enable, (action: Action) => {
            if(action) {
                updateLoop.setUiActionQueue([action]);
            }
            updateLoop.runScaffolding();
        });
        updateLoop.runScaffolding();
    };

    test("A promise that throws an error, will continue. The error object will contain the reason and the eventId", done => {
        const thread1 = scenario(null, function* () {
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