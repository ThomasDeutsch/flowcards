// const mergeValidators = <V>(objects: { [key: string]: V; }[]): { [key: string]: V; } | null => {
//     if(objects.length === 0) return null;
//     return objects.reduce((prev, next) => {
//       Object.keys(prev).forEach(key => {
//         next[key] = { ...next[key], ...prev[key] }
//       })
//       return next;
//     })
//   }
  
//   export function eventValidator<X, V extends { [key: string]: X }>(event: UserEvent<any, V>): ValidatorFn {
//       return (control: AbstractControl): { [key: string]: X } | null => {
//         const x = mergeValidators<X>(event.explain(control.value).failed);
//         return x;
//       };
//   }


//   export class UserEventRx<P = void,V = string> extends UserEvent<P,V> {
//     private _observable: Observable<P | undefined>
//     constructor(nameOrNameKey: string | {name: string, key?: string | number}, initialValue?: P) {
//       super(nameOrNameKey, initialValue);
//       const bs = new BehaviorSubject<P | undefined>(initialValue);
//       const cb = (p: any) => {
//         bs.next(p);
//       }
//       this.registerCallback(cb);
//       this._observable = bs.asObservable();
//     }
  
//     public get value$(): Observable<P | undefined> {
//       return this._observable
//     }
  
//     public override explain(value: P): ExplainEventResult<V> {
  
//         return super.explain(value);
//     }
//   }
  
  
//   export class FlowEventRx<P = void,V = string> extends FlowEvent<P,V> {
//     private _observable: Observable<P | undefined>
//     constructor(nameOrNameKey: string | {name: string, key?: string | number}, initialValue?: P) {
//       super(nameOrNameKey, initialValue);
//       const bs = new BehaviorSubject<P | undefined>(initialValue);
//       const cb = (p: any) => {
//         bs.next(p);
//       }
//       this.registerCallback(cb);
//       this._observable = bs.asObservable();
//     }
  
//     public get value$(): Observable<P | undefined> {
//       return this._observable
//     }
//   }
  