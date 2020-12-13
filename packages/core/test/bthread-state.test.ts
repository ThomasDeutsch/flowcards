import * as bp from "../src/bid";
import { testScenarios, delay } from './testutils';
import { BThreadContext } from '../src/index';
import { scenario } from '../src/scenario';

test("a bthread-state will have an completed count of 0", () => {
    const thread1 = scenario({id: 'T1'}, function* () {
        yield bp.waitFor('A');
    });

    testScenarios((enable) => {
        enable(thread1());
    }, ({thread}) => {
        expect(thread.get('T1')?.completeCount).toBe(0);
    });
});


test("every complete will increase the completeCount", () => {
    const countClicks = scenario({id: 'countClicks', autoRepeat: true}, function* () {
        yield bp.waitFor('click');
        console.log('comp1')
    });

    const clicker = scenario(null, function* () {
        yield bp.request('click');
        yield bp.request('click');
        yield bp.request('click');
    })

    testScenarios((enable) => {
        enable(countClicks());
        enable(clicker());
    }, ({thread}) => {
        expect(thread.get('countClicks')?.completeCount).toBe(3);
    });
});


interface CountClicksProps {
    completed: boolean;
}

test("prop changes will reset the completeCount", () => {
    const countClicks = scenario({id: 'countClicks', autoRepeat: true}, function* ({completed}: CountClicksProps) {
        yield bp.waitFor('click');
    });

    const clicker = scenario(null, function* () {
        yield bp.request('click');
        yield bp.request('click');
        yield bp.request('click');
    })

    testScenarios((enable) => {
        const isClickerCompleted = enable(clicker()).isCompleted;
        enable(countClicks({completed: isClickerCompleted}));
        enable(clicker());
    }, ({thread}) => {
        expect(thread.get('countClicks')?.completeCount).toBe(0);
    });
});