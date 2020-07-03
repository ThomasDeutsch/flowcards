


1. Reject an Resolve Bids are only possible for event-names that are pending for this thread.
2. if a thread has a pending eventId - then it can not be requested by this or any other bid.
3. only pending events can be rejected or resolved.
3. if a reject is the next action, an error is thrown only for the requesting bid.
4. if an extend happened, the event is pending!
9. wenn ein thread weiterläuft und auf einen bid auf einen pending-event hat, dann wir dieser bei resolvement 
10. pending events können nur duch einen resolve oder rejekt gelöscht werden?




Morgen Früh
- ein thread braucht die info, welche (mehrere) events er gerade extended     ( testfall, das er mehrere events extenden kann )
- Bids müssen umgebaut werden. Pending events sind nicht ganz so wie blocks. 
    - Es dürfen für resolve und reject nur pending-events angegeben werden - und von dem thread der einen extend gemacht hat auf diese events (testfall)
      ansonsten gibt es eine warnung oder error.
    - resolve und reject können für pending events geblockt sein - auch mit guard.


Gedanken
Irgendwie ist extend wie lock. 
blocke solange den anderen BThread, bis der lock aufgehoben wurde.
nur lassen sie den original-event zu und geben eine modifizerte version des payloads zurück.d


Resolve und Reject
- Pending Events können nicht dispatched/requested werden - aber resolved oder rejected.
