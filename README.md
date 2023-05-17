Introducing FlowCards: Simplify Application Modeling Scenario by Scenario

flowcards offers a powerful solution to simplify application development. By leveraging flowcards, you can streamline the process and enjoy numerous benefits that enhance your development workflow. Let's explore how flowcards can revolutionize your approach to software development.

## What is flowcards?

flowcards provides a seamless way to translate application scenarios into code. These scenarios describe the necessary steps for the system to achieve specific goals, such as searching for products or handling user interactions. You can think of scenarios as user stories, use cases, or user flows. Take a look at this example scenario written in Gherkin syntax:

**Scenario: User is able to search for products**
- Given the user has selected a category
- When the user enters a search string that is longer than 3 characters
- And the user initiates a search
- Then the products are fetched from the server

With Flowcards, you can directly translate scenarios like this into code, simplifying the development process. Here's a code snippet showcasing the translation:

```js
function* userCanSearchForProducts(selectedCategoryId: number) {
  const searchString = yield* getValue(askFor(startSearchEvent, (input) => input.length > 3));
  yield request(searchProductsEvent, () => getProductsFromServer(selectedCategoryId, searchString));
}
```

## Why Use Flowcards?

Flowcards bring a range of benefits that significantly enhance the software development process. Let's explore how Flowcards can transform your development experience, or jump directly into a code-example

**Enhanced Collaboration:** Flowcards facilitate better communication and collaboration among development teams. By modeling scenarios, everyone gains a clear understanding of the application's functionality and can work together seamlessly.

**Agility and Flexibility:** Flowcards enable agile development, even with larger codebases. By organizing code around scenarios, teams can quickly adapt and make changes without losing context, ensuring development remains agile and responsive.

**Efficient Debugging:** Flowcards simplify the debugging process. With clearly defined scenarios, it becomes easier to trace issues back to their root causes, enabling faster and more effective troubleshooting.

**Reusability and Modularity:** Flowcards promote code reusability and modularity. Once you've modeled and implemented a scenario, you can easily reuse it across different parts of your application, reducing duplication and improving efficiency.

**Easy Maintenance:** Flowcards make maintenance straightforward. When a scenario requires modification or updates, you can locate and make changes without affecting unrelated parts of the codebase, ensuring easier maintenance and reducing the risk of introducing errors.

**Enhanced Testability:** Flowcards simplify the creation of targeted tests for specific scenarios. With well-defined scenarios, you can easily validate the expected behavior of your application through comprehensive testing.

**Improved Documentation:** Flowcards serve as a form of documentation themselves. They provide a visual representation of application scenarios, making it easier for developers to understand and onboard new team members, improving overall documentation.

By harnessing these benefits, Flowcards empower developers to build robust, maintainable applications while streamlining the development process. Start leveraging Flowcards today and experience the transformative power they bring to your software development endeavors.


# Getting Started
npm install @flowcards/core will get you all you need.
It is a [7kb package with no dependencies](https://bundlephobia.com/package/@flowcards/core@12.5.0)

In the following codesandbox, you can find...




## Multiple Flows and Synchronization

In real-world applications, a single flow often doesn't stand alone. Multiple flows need to work together harmoniously. Flowcards facilitate this synchronization using the `yield` keyword.

Consider the following scenario:

**Scenario: User needs to confirm the first search once**
When the user starts a search for the first time
Then the user needs to confirm the search

The corresponding Flowcard code would look like this:

```js
function* userNeedsToConfirmFirstSearch() {
  yield extend(startSearchEvent);
  yield askFor(confirmEvent);
  yield request(startSearchEvent);
}
```

When a flow reaches a `yield` statement, all other flows have also reached a `yield`. This synchronization allows each flow to express what events it wants to happen, extend, or block. We call this the placement of "bids."

## Flow-API and Bids

Within Flowcards, a `yield` statement allows a flow to place one or multiple "bids" for events. A flow cannot force an event to happen but can express its desired outcome. There are seven types of bids available:

1. `waitFor`: The flow waits for a specific event to occur and proceeds once the event is executed.
2. `askFor`: The flow prompts the user to dispatch an event (e.g., a button click).
3. `request`: The flow requests a particular event (e.g., an asynchronous fetch).
4. `validate`: The flow extends the validation of an event.
5. `extend`: The flow extends the logic of an event.
6. `requestWhenAskedFor`: The flow dispatches an event when asked for by another flow.
7. `block`: The flow blocks an event from occurring.

By utilizing these bid types, flows can




TODO, create a tutorial:

Installation and Setup

Provide step-by-step instructions to install the necessary dependencies or tools for using Flowcards.
Guide programmers through the setup process, ensuring they have a working environment to follow along with the tutorial.
Basic Concepts

Introduce the core concepts of Flowcards, such as scenarios, flows, and events.
Explain how scenarios describe the steps required to achieve specific goals.
Describe flows as individual units of execution within a scenario.
Highlight the role of events in coordinating and synchronizing flows.
Translating Scenarios into Code

Walk programmers through the process of translating a scenario into code using Flowcards.
Provide examples using a simple scenario and demonstrate how to write the corresponding code using Flowcard syntax.
Explain the different types of bids available in Flowcards, such as waitFor, askFor, request, validate, extend, requestWhenAskedFor, and block.
Working with Multiple Flows

Illustrate scenarios where multiple flows need to interact and synchronize their execution.
Demonstrate how to handle synchronization using the yield keyword and bids in Flowcards.
Provide code examples that showcase how different flows can extend, block, or wait for events from other flows.
Advanced Flowcard Techniques

Introduce advanced techniques or features in Flowcards that can enhance the development process.
Examples may include error handling, flow branching, or reusable flow components.
Explain how these techniques can improve code modularity, reusability, and maintainability.
Debugging and Testing with Flowcards

Explain how Flowcards can facilitate the debugging process.
Demonstrate techniques for troubleshooting scenarios and identifying issues within flows.
Highlight the ease of writing targeted tests for scenarios using Flowcards.
Best Practices

Share best practices for using Flowcards effectively in real-world projects.
Provide guidance on structuring scenarios, organizing flows, and maintaining clean code using Flowcards.
Offer tips for collaborating with other developers using Flowcards.
Conclusion

Recap the benefits and key concepts of Flowcards.
Encourage programmers to explore further and apply Flowcards in their own projects.
Provide additional resources, such as official documentation, tutorials, or relevant community forums, for programmers to continue their learning journey with Flowcards.
By following this structure, you can provide programmers with a solid foundation in Flowcards and guide them towards effectively using this powerful tool in their development workflow.


