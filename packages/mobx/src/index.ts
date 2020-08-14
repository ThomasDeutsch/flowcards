
import * as Fc from "@flowcards/core";
import { computedFn } from "mobx-utils";
import { observable, decorate } from "mobx";
import { StartReplay } from '../../core/src/index';
import { EventDispatch } from '../../core/src/event-dispatcher';

export * from '@flowcards/core';

export class Store {
  public context: Fc.ScenariosContext;
  private _startReplay: StartReplay;
  private _eventDispatch: EventDispatch;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context, this._eventDispatch, this._startReplay] = Fc.scenarios(stagingFunction, (updatedContext: Fc.ScenariosContext) => {
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
  blocks = this.context.blocks;
  state = this.context.state;
  log =  this.context.log
  startReplay = this._startReplay;
}

decorate(Store, {
  context: observable
});