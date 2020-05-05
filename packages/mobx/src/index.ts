
import * as Fc from "@flowcards/core";
import { computedFn } from "mobx-utils";
import { observable, decorate, computed } from "mobx";

export * from '@flowcards/core';

class FlowcardsStore {
  public context: Fc.ScenariosContext;
  public dispatch: Fc.EventDispatch;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context, this.dispatch] = Fc.scenarios(stagingFunction),
      (updatedContext: Fc.ScenariosContext) => {
        this.context = updatedContext;
    }
  }
  latest = computedFn(function(this: FlowcardsStore, event: Fc.FCEvent | string) {
    return this.context.latest(event);
  });
  isPending = computedFn(function(this: FlowcardsStore, event: Fc.FCEvent | string) {
    return this.context.isPending(event);
  });
  get bTState() {
    return this.context.bTState;
  }
}

export const getStore = () => {
  decorate(FlowcardsStore, {
    context: observable,
    bTState: computed
  });
  return FlowcardsStore;
}