
import bp from "../src/bid";
import { createUpdateLoop, ScaffoldingFunction } from '../src/updateloop';
import { Logger } from "../src/logger";

type TestLoop = (enable: ScaffoldingFunction) => Logger;
let testLoop: TestLoop;


function rejectedDelay(ms: number) {
    return new Promise((resolve, reject) => setTimeout(reject, ms));
}


beforeEach(() => {
    testLoop = (enable: ScaffoldingFunction): Logger => {
        const logger = new Logger();
        const updateLoop = createUpdateLoop(enable, a => updateLoop(a), logger);
        updateLoop();
        return logger;
    };
});


test("A promise can be requested", done => {
    function* thread1() {
        let catched = false;
        try {
            yield bp.request("A", rejectedDelay(100));
        }
        catch (e) {
            catched = true;
        }
        expect(catched).toBeTruthy();
        done();
        
    }
    const logger = testLoop((enable) => {
        enable(thread1);
    });
    
});