import { assertEquals, assertNotEquals, assertExists } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { BidType, toBids, isSameBid, filterRemainingBids, getHighestPriorityWhenBid, Placed, AnyBid, WhenBid, CurrentBidsForEvent } from "../core/bid.ts";
import { Event } from "../core/event.ts";
import { Rule } from "../core/rule.ts";

// Mock Rule and Event instances for testing
const mockRule = (id: string) => ({ id, pathFromRootRule: [id] } as unknown as Rule);
const mockEvent = (id: string) => new Event(id);

const mockPlacedBid = (ruleId: string, bidId: number, eventId: string, type: BidType = BidType.when): Placed<AnyBid<any, any>> => ({
    id: bidId,
    rule: mockRule(ruleId),
    event: mockEvent(eventId),
    type: type
} as Placed<AnyBid<any, any>>);


Deno.test("toBids: handles different inputs", () => {
    const bid1 = { type: BidType.when, event: mockEvent('A') } as AnyBid<any, any>;
    assertEquals(toBids(undefined), undefined, "Should return undefined for undefined input");
    assertEquals(toBids(bid1), [bid1], "Should return array for single bid");
    assertEquals(toBids([bid1, bid1]), [bid1, bid1], "Should return same array for array input");
    assertEquals(toBids([]), [], "Should return empty array for empty array input");
});

Deno.test("isSameBid: compares ruleId and bidId", () => {
    const placedBid = mockPlacedBid('rule1', 10, 'eventA');
    assertEquals(isSameBid(placedBid, 'rule1', 10), true, "Should return true for matching IDs");
    assertEquals(isSameBid(placedBid, 'rule2', 10), false, "Should return false for different rule ID");
    assertEquals(isSameBid(placedBid, 'rule1', 11), false, "Should return false for different bid ID");
});

Deno.test("filterRemainingBids: filters correctly", () => {
    const bid1 = mockPlacedBid('r1', 1, 'e1');
    const bid2 = mockPlacedBid('r1', 2, 'e1');
    const bid3 = mockPlacedBid('r1', 3, 'e1');
    const bids = [bid1, bid2, bid3];

    assertEquals(filterRemainingBids(2, bids), [bid1, bid3], "Should filter out the specified bid ID");
    assertEquals(filterRemainingBids(4, bids), bids, "Should return original array if ID not found");
    assertEquals(filterRemainingBids(1, [bid1]), undefined, "Should return undefined if filtering last bid");
    assertEquals(filterRemainingBids(1, []), undefined, "Should return undefined for empty array");
    assertEquals(filterRemainingBids(1, undefined), undefined, "Should return undefined for undefined input");
});

Deno.test("getHighestPriorityWhenBid: selects correct bid", () => {
    const eventA = mockEvent('A');
    const rule1 = mockRule('rule1');
    const rule2 = mockRule('rule2'); // Simulates extending rule

    const whenBid1 = { ...mockPlacedBid(rule1.id, 1, eventA.id, BidType.when), rule: rule1 } as Placed<WhenBid<any, any>>;
    const whenBid2 = { ...mockPlacedBid(rule2.id, 2, eventA.id, BidType.when), rule: rule2 } as Placed<WhenBid<any, any>>; // From extending rule

    let currentBids: CurrentBidsForEvent<any, any>;

    // No when bids
    currentBids = { event: eventA };
    assertEquals(getHighestPriorityWhenBid(currentBids), undefined, "No when bids");

    // Only one when bid, no extend
    currentBids = { event: eventA, when: [whenBid1] };
    assertEquals(getHighestPriorityWhenBid(currentBids), whenBid1, "One when bid, no extend");

    // Multiple when bids, no extend
    currentBids = { event: eventA, when: [whenBid1, whenBid2] };
    assertEquals(getHighestPriorityWhenBid(currentBids), whenBid1, "Multiple when bids, no extend (returns first)");

    // Multiple when bids, with extend from rule2
    currentBids = {
        event: eventA,
        when: [whenBid1, whenBid2],
        pendingExtend: { event: eventA, extendedBids: [], extendingRule: rule2 } as any
    };
    assertEquals(getHighestPriorityWhenBid(currentBids), whenBid2, "With extend, returns bid from extending rule");

    // Multiple when bids, with extend from rule2, but no when bid from rule2
    currentBids = {
        event: eventA,
        when: [whenBid1], // only bid from rule1
        pendingExtend: { event: eventA, extendedBids: [], extendingRule: rule2 } as any
    };
    assertEquals(getHighestPriorityWhenBid(currentBids), whenBid1, "With extend, but no bid from extending rule (returns first overall)");

     // Multiple when bids, with extend but extend info lacks extendingRule (should not happen, but test robustness)
     currentBids = {
        event: eventA,
        when: [whenBid1, whenBid2],
        pendingExtend: { event: eventA, extendedBids: []} as any // No extendingRule
    };
    assertEquals(getHighestPriorityWhenBid(currentBids), whenBid1, "With extend info missing extendingRule (returns first overall)");
}); 