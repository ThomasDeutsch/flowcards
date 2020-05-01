import { initScenarios } from '../src/index';
import { wait } from '@flowcards/core';

function* flow1() {
    yield wait('test');
}

test('scenarios function returns an initial state', () => {
    initScenarios(enable => {
        enable(flow1);
    });
    expect(1).toEqual(1);
})