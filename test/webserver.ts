import { ActionAndReactionsTest } from "../src/action-reaction-logger.ts";

// Start listening on port 8080 of localhost.
const server = Deno.listen({ port: 8080 });
console.log(`HTTP webserver running.  Access it at:  http://localhost:8080/`);

// Connections to the server will be yielded up as an async iterable.
for await (const conn of server) {
  // In order to not be blocking, we need to handle each connection individually
  // without awaiting the function
  serveHttp(conn);
}

function generateHTMLPage(actions: ActionAndReactionsTest[]) {
  const actionList = actions.map((action, index) => {
    const actionFormId = `actionForm${index}`;

    return `
      <h3>Action</h3>
      <pre>${JSON.stringify(action.action, null, 2)}</pre>
      <h3>Reactions</h3>
      <pre>${JSON.stringify(action.reactions, null, 2)}</pre>
      <h3>Edit Action</h3>
      <form id="${actionFormId}">
        <label for="${actionFormId}-actionType">Action Type:</label>
        <select id="${actionFormId}-actionType" name="${actionFormId}-actionType">
          <option value="external">External Action</option>
          <option value="resolvePendingRequest">Resolve Pending Request</option>
          <option value="rejectPendingRequest">Reject Pending Request</option>
          <option value="requested">Requested Action</option>
          <option value="requestedAsync">Requested Async Action</option>
        </select>

        <label for="${actionFormId}-eventId">Event ID:</label>
        <input type="text" id="${actionFormId}-eventId" name="${actionFormId}-eventId">

        <label for="${actionFormId}-flowId">Flow ID:</label>
        <input type="text" id="${actionFormId}-flowId" name="${actionFormId}-flowId">

        <label for="${actionFormId}-bidId">Bid ID:</label>
        <input type="number" id="${actionFormId}-bidId" name="${actionFormId}-bidId">

        <label for="${actionFormId}-actionId">Action ID:</label>
        <input type="number" id="${actionFormId}-actionId" name="${actionFormId}-actionId">

        <label for="${actionFormId}-payload">Payload:</label>
        <textarea id="${actionFormId}-payload" name="${actionFormId}-payload"></textarea>

        <button type="submit">Submit</button>
      </form>
      <h3>Logged Action:</h3>
      <pre id="${actionFormId}-loggedActionResult"></pre>
      <script>
        document.getElementById('${actionFormId}').addEventListener('submit', function(event) {
          event.preventDefault();

          const actionType = document.getElementById('${actionFormId}-actionType').value;
          const eventId = document.getElementById('${actionFormId}-eventId').value;
          const flowId = document.getElementById('${actionFormId}-flowId').value;
          const bidId = parseInt(document.getElementById('${actionFormId}-bidId').value, 10);
          const actionId = parseInt(document.getElementById('${actionFormId}-actionId').value, 10);
          const payload = document.getElementById('${actionFormId}-payload').value;

          const loggedAction = generateLoggedAction(actionType, eventId, flowId, bidId, actionId, payload);
          document.getElementById('${actionFormId}-loggedActionResult').textContent = JSON.stringify(loggedAction, null, 4);
        });

        function generateLoggedAction(actionType, eventId, flowId, bidId, actionId, payload) {
          const loggedAction = {
              type: actionType,
              eventId: eventId,
              flowId: flowId,
              bidId: bidId
          };

          if (actionType === 'external' || actionType === 'requested') {
              loggedAction.id = actionId;
              loggedAction.payload = payload;
          } else if (actionType === 'resolvePendingRequest') {
              loggedAction.id = actionId;
              loggedAction.payload = payload;
              loggedAction.requestActionId = actionId;
          } else if (actionType === 'rejectPendingRequest') {
              loggedAction.id = actionId;
              loggedAction.requestActionId = actionId;
              loggedAction.error = payload;
          } else if (actionType === 'requestedAsync') {
              loggedAction.id = actionId;
              loggedAction.payload = '__%TAKE_PAYLOAD_FROM_BID%__';
              loggedAction.resolveRejectAction = { resolveActionId: actionId, rejectActionId: actionId };
          }

          return loggedAction;
        }
      </script>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Action and Reactions Test</title>
      </head>
      <body>
        <h1>Action and Reactions Test</h1>
        ${actionList}
      </body>
    </html>
  `;
}

async function serveHttp(conn: Deno.Conn) {
    // This "upgrades" a network connection into an HTTP connection.
    const httpConn = Deno.serveHttp(conn);
    // Each request sent over the HTTP connection will be yielded as an async
    // iterator from the HTTP connection.
    for await (const requestEvent of httpConn) {
      // The native HTTP server uses the web standard `Request` and `Response`
      // objects.
      const data = await Deno.readFile('actions.json');
      const decoder = new TextDecoder();
      const actionsJson = decoder.decode(data);
      const actions = JSON.parse(actionsJson);
      const html = generateHTMLPage(actions);
      // The requestEvent's `.respondWith()` method is how we send the response
      // back to the client.
      const test = new TextEncoder().encode(html)

      requestEvent.respondWith(
        new Response(test),
      );
    }
  }
