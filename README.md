# flowcards
model application behaviour based on use-cases, that can be easily reasoned about.

## What is flow based modeling?
In contrast to the object-oriented approach, where behaviour is described by the reactivity of different objects,
in a flow based approach, the behaviour is described as an inter-object flow.


For example this Requirement (Scenario)

### example: user is able to search for products
- Given: the user has selected a category
- When: the user entered a search-string that is longer than 3 characters
- And: the user starts a search
- Then: the products are fetched from the server

A scenario can be directly translated into a flow:

```js
function* userCanSearchForProducts(selectedCategoryId: number) {
 const searchString = yield* getEventValue(askFor(startSearchEvent, (input) => input.length > 3));
 yield request(searchProductsEvent, () => getProducts(selectedCategoryId, searchString))
}
```

## Why?
By writing flows, you are able to organize code on a requirements level.
This means, that your code will always be organized by "what the software is supposed to do".
The question "why is this code here" is always easy to answer, because the context (requirement/scenario) is not lost.
Tracability management can become obsolete.

## Multiple Flows
Usually, a flow will not stand alone by itself. Multiple flows will need to play together and because of this,
they all are syncronized by using the yield keyword.

For example you have this Scenario:

Scenario: user needs to confirm the first search once
When the user starts a search for the first time
Then the user needs to confirm the search

```js
function* userNeedsToConfirmFirstSearch() {
 yield extend(startSearchEvent);
 yield askFor(confirmEvent);
 yield request(startSearchEvent);
}
```
When a flow reaches a yield, all other flows have reached a yield as well.
Because of this synchronization, every flow can tell what events it want to happen, or what events it wants to extend or block.
This is called the placement of "bids".

## Flow-API (bids)
A yield will allow the flow to place one or multiple "bids".
It is called a bid, because a flow can not force an event to happen, it can only place a bid of what it wants to happen.

There are 7 types of bids:

- waitFor the flow waits for an event to happen, and proceeds if the event is executed
- askFor  the flow asks the user to dispatch an event ( like a button click )
- request the flows requests an event ( for example an async fetch )
- validate the flow extends the validation of the event
- extend the flows will extend the logic of an event
- trigger the flow will dispatch an event ( that is asked for by another flow )
- block the flow will block an event

## Final Goal
The final goal is a better interconnection between the fields of software development.


 All [behavioral programming principles](http://www.wisdom.weizmann.ac.il/~bprogram/more.html) are provided by the BP-Team around [Prof. David Harel](http://www.wisdom.weizmann.ac.il/~harel/) - the mind behind Statecharts.
