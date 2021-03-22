import { extend, request, scenario } from "../src";
import { delay, testScenarios } from "./testutils";

test("a request can be extended. After resolving the extend, the extend-bid will not be used again in this run.", (done) => {

    const requestingThread = scenario({id: 'requestingThread'}, function* () {
        const val = yield request("eventiii");
        expect(val).toBe(12);
        done();
    });

    const extendingThread = scenario({id: 'extendingBThread', autoRepeat: false}, function* () {
        while(true) {
            const x = yield extend("eventiii");
            yield request('xiiiiiiooioioioioi');
            console.log('X: ', x)
            x.resolve(12);
        }
    });

    testScenarios((enable) => {
        enable(requestingThread());
        enable(extendingThread());
    }, ({log}) => console.log('log: ', log.actions));
});