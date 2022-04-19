## @flowcards/core
Scenario based programming for JavaScript/TypeScript

The flowcards core package has one main `scenarios` function.<br/>
It will create an update-loop and make the initial setup call.<br/>
When there is a new update, the update callback function gets called with an a new scenarios-context and dispatcher.<br/>

 ```ts
scenarios(StagingFunction, UpdateCallback)
 ```
 
<img src="/docs/img/update-loop-chart.svg" width="730">

 
 ### The architecture is based on these principles
 - The behavioral programming infrastructure causes b-threads to synchronize with each other (e.g., waiting for each other) before generating events. This gives b-threads the opportunity to forbid or override each other's events. The synchronization is automatic and occurs at the point "setup and delete BThreads".
 - When a b-thread generates an event it recognizes this as merely putting forward a request for consideration in the execution, and it is prepared to handle situations where the event will in fact not be triggered, or will be postponed, briefly or indefinitely. A b-thread may wish to wait indefinitely until the event is triggered, and the system, in turn, is not negatively affected by a large number of such waiting b-threads. Alternatively, a b-thread may monitor certain events that occur as it waits for the triggering of its requested event, and then withdraw its own request before the requested events are actually triggered.
 - Only events that are requested and not blocked can be triggered ( not blocked bids are calculated at the "get bids" step )
 - A b-thread can progress past a synchronization point when an event that it requested or waited for is triggered ( this is done at the step "advance BThreads")
 - When a selected event is requested by two or more b-threads, all b-threads requesting it are notified (in addition to those who are only listening-out for it). Each requesting b-thread will advance in the same manner as it would have had it been the only requester. If the event is associated with some execution external to the b-threads, such as logging or execution of an associated method, this processing/effect will occur only once. (also done by the "advance BThreads step)
 - B-threads can use standard interfaces to their environment (e.g., access services, other js-libs, ...) in order to translate external occurrences into behavioral events and vice versa.

 All [behavioral programming principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html) are provided by the BP-Team around [Prof. David Harel](http://www.wisdom.weizmann.ac.il/~harel/) - the mind behind Statecharts.
