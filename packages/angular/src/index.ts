import { Injectable } from "@angular/core";
import * as Rx from "rxjs";
import { scenarios, ScenariosContext, StagingFunction } from "@flowcards/core";

@Injectable()
export class Scenarios {
  public state?: Rx.Observable<ScenariosContext>;

  public init(stagingFunction: StagingFunction) {
    const subject = new Rx.BehaviorSubject<ScenariosContext>(
      scenarios(
        stagingFunction,
        (a: ScenariosContext): void => {
          subject.next(a);
        },
        false
      )
    );
    this.state = subject.asObservable();
  }
}