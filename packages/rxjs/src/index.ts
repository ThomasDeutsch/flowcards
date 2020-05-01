import * as Rx from "rxjs";
import * as Fc from "@flowcards/core";

export * from '@flowcards/core';

export function scenarios(stagingFunction: Fc.StagingFunction): [Rx.Observable<Fc.ScenariosContext>, Fc.EventDispatch] {
  const [init, dispatch] = Fc.scenarios(stagingFunction, (a: Fc.ScenariosContext): void => {
      subject.next(a);
  });
  const subject = new Rx.BehaviorSubject<Fc.ScenariosContext>(init);
  return [subject.asObservable(), dispatch];
}