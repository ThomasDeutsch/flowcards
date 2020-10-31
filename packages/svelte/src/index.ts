import { writable} from "svelte/store";
import { StagingFunction, scenarios, ScenariosContext } from '@flowcards/core';

export * from '@flowcards/core';

interface StoreContext {
  subscribe: any; // TODO: use Svelte Types
  context: ScenariosContext;
}

export function scenariosStore(stagingFunction: StagingFunction): StoreContext {
  const [context] = scenarios(stagingFunction, (a) => set(a));
  const { subscribe, set } = writable(context);
  return {
    subscribe,
    context
  };
}