import * as bp from "../src/bid";
import { ActionType } from '../src/action';
import { UpdateLoop } from '../src/update-loop';
import { scenario } from '../src/scenario';
import { StagingFunction } from '../src/scaffolding';
import { AnyAction, Logger, RequestedAction, ResolveAction, ResolveExtendAction, UIAction } from "../src";


function rejectedDelay(ms: number) {
    return new Promise((resolve, reject) => setTimeout(() => reject('reject reason'), ms));
}

describe('dispatched action', () => {

    const testLoop = (enable: StagingFunction): void => {
        const updateLoop = new UpdateLoop(enable, (action: any) => {
            if(action) {
                updateLoop.setActionQueue([action]);
            }
            updateLoop.runScaffolding();
        }, new Logger());
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