import { writable} from "svelte/store";
import { StagingFunction, scenarios } from '@flowcards/core';
import { StartReplay } from '../../core/src/index';
import { ScenariosContext } from '../../core/src/update-loop';

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