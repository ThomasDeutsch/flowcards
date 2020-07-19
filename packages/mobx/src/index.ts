
import * as Fc from "@flowcards/core";
import { computedFn } from "mobx-utils";
import { observable, decorate } from "mobx";

export * from '@flowcards/core';

export class Store {
  public context: Fc.ScenariosContext;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context] = Fc.scenarios(stagingFunction, (updatedContext: Fc.ScenariosContext) => {
      this.context = updatedContext;
    });
  }
  dispatch = computedFn(function(this: Store, event:  Fc.FCEvent | string, payload: any) {
    return this.context.dispatch(Fc.toEvent(event), payload);
  });
  event = computedFn(function(this: Store, event: Fc.FCEvent | string) {
    return this.context.event(Fc.toEvent(event));
  });
  pending = this.context.pending;
}

decorate(Store, {
  context: observable
});