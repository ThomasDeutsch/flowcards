
import * as Fc from "@flowcards/core";
import { FCEvent } from "packages/core/src/event";
import { computedFn } from "mobx-utils";
import { observable, decorate, computed } from "mobx";

export * from '@flowcards/core';

export class FlowcardsStore {
  private _context: Fc.ScenariosContext;
  public dispatch: Fc.EventDispatch;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this._context, this.dispatch] = Fc.scenarios(stagingFunction),
      (updatedContext: Fc.ScenariosContext) => {
        this._context = updatedContext;
    }
  }
  latest = computedFn(function(this: FlowcardsStore, event: FCEvent | string) {
    return this._context.latest(event);
  });
  isPending = computedFn(function(this: FlowcardsStore, event: FCEvent | string) {
    return this._context.isPending(event);
  });
  get bTState() {
    return this._context.bTState;
  }
}

decorate(FlowcardsStore, {
  context: observable,
  bTState: computed
});