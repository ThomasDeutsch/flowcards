
// pending events können nicht requested oder intercepted werden
// pending events können rejected oder resolved werden ( aber nur von den intercepted oder asnyc-requested threads, nicht über die bid api )
// auf pending events kann gewartet werden, aber sie können nicht dispatched werden ( hier bei dispatch by wait anpassungen machen )
// nur wenn es pending events gibt, dann gibt es auch resolve oder reject ( hier anpassungen beim thread machen )



// test: a pending event can not be requested
// test: an intercept will create a pending event
// test: waits can be intercepted ( do this by a dispatched action )
// test: requests that are pending are not intercepted. 
// test: if an intercept thread has completed, it will not release the intercepted events.
// test: if a requested thread has completed, it will not release the pending requests.
// test: pending events can not be blocked
// test: if there is a pending-event an a new wait - it will trigger, as the event is resolved.
// test: rejected pending events will have no effect on the waits.
// test: pening events can not be dispatched
// test: if an async request is intercepted, the intercept will wait for the request to resolve or reject
// test: if an intercept will intercept another intercept, it will do so if the first intercept ist resolved or rejected
