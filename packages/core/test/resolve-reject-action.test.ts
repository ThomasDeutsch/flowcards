
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { Action, ActionType } from '../src/action';
import { createUpdateLoop, StagingFunction } from '../src/update-loop';

function rejectedDelay(ms: number) {
    return new Promise((resolve, reject) => setTimeout(() => reject('reject reason'), ms));
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms)).then(() => 'data');
}

test("when a promise is resolved, it will dispatch an Action.", done => {

    const testLoop = (enable: StagingFunction): void => {
        const updateLoop = createUpdateLoop(enable, (action: Action) => {
            if(action) {
                expect(action.type).toBe(ActionType.resolved);
                expect(action.threadId).toBe('thread1');
                expect(action.event.name).toBe('A');
                expect(action.payload).toBe('data');
            }
            updateLoop(action);
        });
        updateLoop(null);
    };

    function* thread1() {
        yield bp.request("A", delay(100));
        done();
    }

    testLoop((enable) => {
        enable(thread1);
    });
});


describe('dispatched action', () => {

    const testLoop = (enable: StagingFunction): void => {
        const updateLoop = createUpdateLoop(enable, (a: Action) => {
            updateLoop(a, null);
        });
        updateLoop(null);
    };

    test("A promise that throws an error, will continue. The error object will contain the reason and the eventId", done => {
        function* thread1() {
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
        }
        testLoop((enable) => {
            enable(thread1);
        });    
    });
});