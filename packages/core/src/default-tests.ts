import { BidsByType, isBlocked, BidType } from './bid';
import { ActionType, ActionWithId, getMatchingBids } from './index';
import { BThreadMap } from './bthread-map';
import { BThread } from './bthread';


enum TestResult {
    OK,
    IsBlocked,
    IsInvalidPayload,
    NotAskedFor,

}

export function defaultTest(bThreadMap: BThreadMap<BThread>, activeBidsByType: BidsByType, action: ActionWithId) {
    if(isBlocked(activeBidsByType, action.eventId, action)) return TestResult.IsBlocked;
    if(action.type === ActionType.ui && !activeBidsByType[BidType.askFor]?.hasMatching(action.eventId)) return TestResult.NotAskedFor;

    const matchingBids = getMatchingBids(activeBidsByType, types, eventId);
    //if(!isValid(bid, action.payload)) return undefined;
    return TestResult.OK

}