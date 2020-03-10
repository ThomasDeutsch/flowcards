
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as bp from "../src/bid";
import { createUpdateLoop, ScaffoldingFunction, DispatchedAction } from '../src/update-loop';
import { Logger } from "../src/logger";

function rejectedDelay(ms: number) {
    return new Promise((resolve, reject) => setTimeout(() => reject('reject reason'), ms));
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms)).then(() => 'data');
}

test("when a promise is resolved, it will dispatch an ExternalAction.", done => {

    const testLoop = (enable: ScaffoldingFunction): Logger => {
        const logger = new Logger();
        const updateLoop = createUpdateLoop(enable, (action: DispatchedAction) => {
            if(action.payload) {
                expect(action.payload.type).toBe('resolve');
                expect(action.payload.threadId).toBe('thread1');
                expect(action.payload.eventName).toBe('A');
                expect(action.payload.payload).toBe('data');
            }
            updateLoop(action);
        }, logger);
        updateLoop(null);
        return logger;
    };

    function* thread1() {
        yield bp.request("A", delay(100));
        done();
    }

    testLoop((enable) => {
        enable(thread1);
    });
});


describe('external actions', () => {

    const testLoop = (enable: ScaffoldingFunction): Logger => {
        const logger = new Logger();
        const updateLoop = createUpdateLoop(enable, (a: DispatchedAction) => {
            updateLoop(a, null);
        }, logger);
        updateLoop(null);
        return logger;
    };

    test("A promise that throws an error, will continue. The error object will contain the reason and the eventName", done => {
        function* thread1() {
            let catched = false;
            try {
                yield bp.request("A", rejectedDelay(1));
            }
            catch (e) {
                catched = true;
                expect(e.eventName).toBe('A');
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