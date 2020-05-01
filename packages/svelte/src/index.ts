import { writable} from "svelte/store";
import { StagingFunction, scenarios } from '@flowcards/core';

export * from '@flowcards/core';

export function scenariosStore(stagingFunction: StagingFunction): any {
  const [init, dispatch] = scenarios(stagingFunction, (a) => set(a));
  const { subscribe, set } = writable(init);
  return {
    subscribe, 
    dispatch: dispatch
  };
}