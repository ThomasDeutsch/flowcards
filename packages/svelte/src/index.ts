import { writable} from "svelte/store";
import { ScaffoldingFunction, scenarios } from '@flowcards/core';

export * from '@flowcards/core';

export function scenariosStore(scaffoldingFn: ScaffoldingFunction): any {
  const { subscribe, set } = writable({});
  scenarios(scaffoldingFn, set);
  return {
    subscribe
  };
}