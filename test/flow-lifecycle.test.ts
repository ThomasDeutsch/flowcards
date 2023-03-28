import { allDefinedOrEndFlow, Flow } from "../src/flow";
import { Event } from "../src/event";
import { request, waitFor } from "../src/bid";
import { testSchedulerFactory } from "./utils";
import { delay } from "./test-utils";


describe("a flow execution", () => {

    test('will not automaticall restart after a flow is ended', (done) => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory( function*(this: Flow) {
            this.startFlow('subflow', function* () {
                nrBids++;
                yield request(eventA, 1);
            }, []);
            yield waitFor(eventA);
            expect(eventA.value).toBe(1);
            yield [waitFor(eventA), request(eventA, () => delay(100, 2))];
            expect(nrBids).toBe(1);
            expect(eventA.value).toBe(2);
            done();
        });
    });

    test('.endFlows() will end all child-flows', (done) => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory( function*(this: Flow) {
            this.startFlow('subflow', function* () {
                yield request(eventA, 1);
            }, []);
            this.endFlows();
            yield [waitFor(eventA), request(eventA, () => delay(500, 2))];
            expect(eventA.value).toBe(2);
            done();
        });
    });

    test('if the string "endFlow" is passed instead of an array, the flow is ended.', (done) => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory( function*(this: Flow) {
            this.startFlow('subflow', function* () {
                yield request(eventA, 1);
            }, 'endFlow');
            yield [waitFor(eventA), request(eventA, () => delay(500, 2))];
            expect(eventA.value).toBe(2);
            done();
        });
    });

    test('if the string "endFlow" is passed instead of an array, the flow is ended, using the helper function allDefinedOrEndFlow', (done) => {
        const eventA = new Event<number>('eventA');
        let nrBids = 0;
        testSchedulerFactory( function*(this: Flow) {
            this.startFlow('subflow', function* (number1: number, number2: number, number3: number) {
                yield request(eventA, 1);
            }, allDefinedOrEndFlow(7, 1, undefined));
            yield [waitFor(eventA), request(eventA, () => delay(500, 2))];
            expect(eventA.value).toBe(2);
            done();
        });
    });
});