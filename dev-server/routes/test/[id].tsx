import { Handlers } from "$fresh/server.ts";
import { PageProps } from "$fresh/server.ts";
import { ActionAndReactions, AskForBid, AugmentedAction, LoggedAction, Placed, Event, Engine} from "../../../core/index.ts";
import { TestRecord, runTests } from "../../tests/utils.ts";


/**
 * augment the recorded actions, so that they contain information about cancelled, resolved and rejected actions
 * @param recorded recorded actions and reactions
 */
function augmentRecorded(recorded: ActionAndReactions[]): ActionAndReactions[] {
  recorded.forEach(anr => {
    const actionId = anr.action?.id || 0;
    anr.reactions?.forEach(reaction => {
      if(reaction.type === 'pending request cancelled' || reaction.type === 'pending extend cancelled') {
        const cancelledAction = recorded.at(reaction.details.actionId || 0)?.action;
        if(cancelledAction) {
          cancelledAction.cancelledBy = actionId;
        }
      }
      if(reaction.type === 'pending request resolved' || reaction.type === 'pending extend resolved') {
        const resolvedAction = recorded.at(reaction.details.actionId || 0)?.action;
        if(resolvedAction) {
          resolvedAction.resolvedBy = actionId;
        }
      }
      if(reaction.type === 'pending request rejected') {
        const rejectedAction = recorded.at(reaction.details.actionId || 0)?.action;
        if(rejectedAction) {
          rejectedAction.rejectedBy = actionId;
        }
      }
    });
  });
  return recorded;
}

// TODO: 
// - show the event-color
// - show if an event is pending, resolved or rejected
// - show the payload of the event
// - if result > recorded then with a click of a button, the results-diff will be copied to the clipboard
// - show the reactions of an action
// - with a click on an askForBid, an action is copied to the clipboard



export const handler: Handlers<{recorded: ActionAndReactions[], engine?: Engine}> = {
    async GET(_req, ctx) {
        try {
            const fileName = ctx.params.id;
            if(ctx.state.recorded) {
              console.log('SUCCESS');
            }
            const test: {default: TestRecord} = await import(`../../tests/${fileName}.ts`);
            const {recorded, result, engine} = await runTests(test.default["a given bid will"]());
            // from the recoreded reactions, get all informations for the actions
            augmentRecorded(recorded);
            return ctx.render({recorded, engine});
        }
        catch(error) {
            // in this case, an assert failed
            console.error('test failed');
            return ctx.render({recorded: [], engine: undefined});
        }
    },
};

function getEventColor(action: AugmentedAction<any>) {
  if(action.type === 'requested') return 'bg-yellow-500';
  if(action.type === 'external') return 'bg-blue-500';
  if(action.type === 'rejectPendingRequest') return 'bg-red-500';
  if(action.type === 'resolvePendingRequest') return 'bg-green-500';
  if(action.type === 'requestedAsync') return 'bg-purple-500';
}


function ActionCard(action: AugmentedAction<any>, ) {
  return (
    <li className="shadow-sm bg-zinc-100 flex items-start justify-between gap-5 pr-3 rounded-md">
      <div className="self-stretch flex items-start justify-between gap-1.5">
        <div className={"text-zinc-100 text-sm self-stretch whitespace-nowrap w-[30px] max-w-full pl-2 pr-2.5 py-1 rounded-md " + getEventColor(action)}>
          {action.id}
        </div>
        <div className="text-black text-base self-center whitespace-nowrap my-auto">
          {action.eventId}
        </div>
      </div>
      <div className="self-center flex items-start gap-1.5 my-auto">
        <div
          className="bg-green flex h-2 w-full flex-col flex-1 rounded-md"
        ></div>
        <div className="text-neutral-500 text-xs self-stretch whitespace-nowrap">
          {action.cancelledBy ? action.cancelledBy : ''}
        </div>
        {action.type === 'requestedAsync' && !action.resolvedBy && !action.rejectedBy ? 'pending' : 'check'}
      </div>
    </li>
  );
}


/**
 * a page that renders a list of actions and the corresponding reactions
 * @param props 
 * @returns a visualization of the ActionAndReactions array
 */
export default function actionsAndReactionsPage(props: PageProps<{recorded: ActionAndReactions[], engine?: Engine}>) {
    return (
        <div>
            <h1>Actions and Reactions</h1>
            <ul>
                {props.data.recorded.map((actionAndReaction) => {
                    if(actionAndReaction.action) {
                      return ActionCard(actionAndReaction.action);
                    }
                })}
            </ul>
            <ul>
              <form>
                <fieldset>
                  <legend>dispatch an event</legend>
                  {props.data.engine?.askForBids.map(bid => (
                    <div>
                      <input type="radio" name="eventId" value={bid.event.id} required/>
                      <label for={bid.event.id}>{bid.event.id}</label>
                    </div>
                  ))}
                </fieldset>
                <textarea name="payload" cols={50} rows={10}></textarea>
                <button type="submit">Dispatch</button>
              </form>
            </ul>
        </div>
    );
}