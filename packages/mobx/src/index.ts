
import * as Fc from "@flowcards/core";
import { observable, decorate } from "mobx";

export * from '@flowcards/core';

export class Store {
  public context: Fc.ScenariosContext;
  public event: any;
  public logger: any;
  public thread: any;

  constructor(stagingFunction: Fc.StagingFunction) {
    [this.context] = Fc.scenarios(stagingFunction, (updatedContext: Fc.ScenariosContext) => {
      this.context = updatedContext;
    }, true);
    this.event = this.context.event;
    this.logger = this.context.log;
    this.thread = this.context.thread;
  }

}

decorate(Store, {
  context: observable
});