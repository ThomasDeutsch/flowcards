import * as Rx from "rxjs";
import * as Fc from "@flowcards/core";

export * from '@flowcards/core';

export function initScenarios(stagingFunction: Fc.StagingFunction): Rx.Observable<Fc.ScenariosContext> {
    const subject = new Rx.BehaviorSubject<Fc.ScenariosContext>(
      Fc.scenarios(
        stagingFunction,
        (a: Fc.ScenariosContext): void => {
          subject.next(a);
        },
        false
      )
    );
    return subject.asObservable();;
}