import { writable} from "svelte/store";
import { StagingFunction, scenarios } from '@flowcards/core';

export * from '@flowcards/core';

export function scenariosStore(stagingFunction: StagingFunction): any {
  const { subscribe, set } = writable({});
  scenarios(stagingFunction, set);
  return {
    subscribe
  };
}