import { writable} from "svelte/store";
import { createUpdateLoop, ScaffoldingFunction, DispatchedAction } from '@flowcards/core';

export function scenarios(scaffoldingFn: ScaffoldingFunction): any {
  const { subscribe, set } = writable({});
  const updateLoop = createUpdateLoop(scaffoldingFn, (a: DispatchedAction): void => {
    set(updateLoop(a, null));
  });
  set(updateLoop(null));
  return {
    subscribe
  };
}