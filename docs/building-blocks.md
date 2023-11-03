# The Auction
To maintain order in an otherwise chaotic environment, the rules of an auction house are clear for all participants.
It is not the first bidder, who takes the price. Every bidder can place a bid, and after the bids have settled the auctioneer will sell the item to the highest bidder.

This is how events are handled in flowcards. Events can not simply be fired, every flow can hold up a card to say
what event it wants to see, and after all flows have placed the bids, the scheuler will decide what event will be triggerd next.

# Bids
The bids are the only way for a flow to communicate to the engine (the auctioneer). They can not influence or overrule other bidders (flows) directly.
We will leave the auction house analogy at this point, because not the auction house is in charge of the items that are
for sale, the bidders can hold a sign that says "i want to sell my car".
Or if nobody in that room holds any sign, then they all sit there and wait - for all eternity if needed.
Threre are 3 main types of bids.

### request bid
Every flow can request an event. It can hold up a sign that says "i want the SellItem event to happen".
If not flows have other bids, then this event will happen next.
There is also an order for the engine - if two or more flows place a request bid, then the flow that was enabled last has the hightest priority.

### waitFor bid
Other flows can wait for an event. They place a bid that will allow them to react to an event that is accepted by the engine. It is like "i am not the one requesting this event, i only want to be notified if that event happened".
You can imagine like 10 bidders holding up a sign that reads "i want to react to the SellItem event". And they will hold that signs until some other bidder holds up a sign that reads "i want the SellItem event to happen" - finally, this what they have all been waiting for. The Scheduler accepts, and 11 flows will progress (the one requesting the event and 10 other flows that have waited)

### askFor bid
askFor bids enable the user to trigger a specific event. They can say "user is alloed to trigger the count event".
While the waitFor is simply waiting for an event, the askFor bids enables the user to trigger.


# The Scheduler
- overview ( how it works )
- step by step (example)
- why generator functions

## Flow building blocks
- flows and subflows ( football-game analogy )
- requesting flows (async)

