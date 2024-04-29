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



export const handler: Handlers<{recorded: ActionAndReactions[], engine?: Engine}> = {
    async GET(_req, ctx) {
        try {
            const fileName = ctx.params.id;
            if(ctx.state.recorded) {
              console.log('SUCCESS');
            }
            const test: {default: TestRecord} = await import(`../../tests/${fileName}.ts`);
            console.log(test.default['a given bid will'].toString())
            const {recorded, result, engine} = await runTests(test.default["a given bid will"]());
            // from the recoreded reactions, get all information for the actions
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

function nodeActionAndReactions(actionAndReactions: ActionAndReactions) {
  const action = actionAndReactions.action;
  const actionElement = action && <div>
    {action.type}: {action.eventId} by {action.flowPath.join(' > ')}
    {/* {action.cancelledBy}
    {action.resolvedBy}
    {action.rejectedBy} */}
  </div>
  const reactions = actionAndReactions.reactions?.map(reaction => <li>
    {reaction.flowPath.join(' > ')}: {reaction.type}
    </li>)
  return (
    <div>
        {actionElement}
      <ul>
        {reactions}
      </ul>
    </div>
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
                      return nodeActionAndReactions(actionAndReaction);
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