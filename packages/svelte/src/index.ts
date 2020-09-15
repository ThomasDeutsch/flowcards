import { writable} from "svelte/store";
import { StagingFunction, scenarios, StartReplay, ScenariosContext } from '@flowcards/core';

export * from '@flowcards/core';

interface StoreContext {
  subscribe: any; // TODO: use Svelte Types
  context: ScenariosContext;
  startReplay: StartReplay;
}

export function scenariosStore(stagingFunction: StagingFunction): StoreContext {
  const [context, startReplay] = scenarios(stagingFunction, (a) => set(a));
  const { subscribe, set } = writable(context);
  return {
    subscribe,
    context,
    startReplay
  };
}