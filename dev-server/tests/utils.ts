import { ActionAndReactions, FlowGeneratorFunction, Engine } from "../../core/index.ts";
import { deadline } from "https://deno.land/std@0.190.0/async/mod.ts";
import { actionReactionTester, TestResult } from "../../core/index.ts";

export type TestRecord = Record<string, () => TestCase>;
export type TestCase = { rootFlow: FlowGeneratorFunction, replay?: ActionAndReactions[] };

export async function runTests({rootFlow, replay}: TestCase) {
    const useMocks = replay !== undefined;
    const promise = new Promise<{recorded: ActionAndReactions[], result: TestResult, engine: Engine}>((resolve) => {
    const finishCallback = (result: TestResult, recorded: ActionAndReactions[], engine: Engine) => {
        resolve({recorded, result, engine});
        }
        new Engine({
            id: 'rootFlow',
            rootFlow,
            actionReactionGeneratorFn: (e) => actionReactionTester(e, useMocks, [...(replay || [])], finishCallback)
        }).start();
    });
    await deadline(promise, 3000);
    return promise;
}