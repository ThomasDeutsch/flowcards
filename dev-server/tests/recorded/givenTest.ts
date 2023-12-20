export default [
  {
    "reactions": [
      {
        "flowPath": [
          "rootFlow",
          "givenFlow"
        ],
        "type": "flow enabled",
        "details": {}
      },
      {
        "flowPath": [
          "rootFlow"
        ],
        "type": "flow enabled",
        "details": {}
      }
    ]
  },
  {
    "action": {
      "id": 0,
      "type": "requested",
      "eventId": "eventA",
      "payload": 20,
      "bidId": 0,
      "flowPath": [
        "rootFlow"
      ]
    },
    "reactions": [
      {
        "flowPath": [
          "rootFlow"
        ],
        "type": "flow progressed on a bid",
        "details": {
          "bidId": 0,
          "bidType": "request",
          "eventId": "eventA",
          "actionId": 0
        }
      },
      {
        "flowPath": [
          "rootFlow",
          "givenFlow"
        ],
        "type": "an active given was added",
        "details": {
          "eventId": "eventA"
        }
      },
      {
        "flowPath": [
          "rootFlow",
          "givenFlow"
        ],
        "type": "flow progressed on a bid",
        "details": {
          "bidId": 0,
          "bidType": "given",
          "eventId": "eventA",
          "actionId": 0
        }
      }
    ]
  },
  {
    "action": {
      "id": 1,
      "type": "requested",
      "eventId": "eventB",
      "payload": 20,
      "bidId": 1,
      "flowPath": [
        "rootFlow"
      ]
    },
    "reactions": [
      {
        "flowPath": [
          "rootFlow"
        ],
        "type": "flow progressed on a bid",
        "details": {
          "bidId": 1,
          "bidType": "request",
          "eventId": "eventB",
          "actionId": 1
        }
      },
      {
        "flowPath": [
          "rootFlow",
          "givenFlow"
        ],
        "type": "an active given was added",
        "details": {
          "eventId": "eventB"
        }
      },
      {
        "flowPath": [
          "rootFlow",
          "givenFlow"
        ],
        "type": "flow progressed on a bid",
        "details": {
          "bidId": 1,
          "bidType": "given",
          "eventId": "eventB",
          "actionId": 1
        }
      }
    ]
  },
  {
    "action": {
      "id": 2,
      "type": "requested",
      "eventId": "eventB",
      "payload": 10,
      "bidId": 2,
      "flowPath": [
        "rootFlow"
      ]
    },
    "reactions": [
      {
        "flowPath": [
          "rootFlow"
        ],
        "type": "flow progressed on a bid",
        "details": {
          "bidId": 2,
          "bidType": "request",
          "eventId": "eventB",
          "actionId": 2
        }
      },
      {
        "flowPath": [
          "rootFlow",
          "givenFlow"
        ],
        "type": "flow restarted because the value of a given event changed",
        "details": {}
      },
      {
        "flowPath": [
          "rootFlow",
          "givenFlow"
        ],
        "type": "flow progressed on a bid",
        "details": {
          "bidId": 0,
          "bidType": "given",
          "eventId": "eventA"
        }
      },
      {
        "flowPath": [
          "rootFlow",
          "givenFlow"
        ],
        "type": "an active given was added",
        "details": {
          "eventId": "eventA"
        }
      }
    ]
  }
]