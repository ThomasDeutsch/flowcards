import { ActionAndReactions, AugmentedAction, Engine } from "../../core/index.ts";

function ActionCard(action: AugmentedAction<any>, ) {
    return (
      <li className="shadow-sm bg-zinc-100 flex items-start justify-between gap-5 pr-3 rounded-md">
        <div className="self-stretch flex items-start justify-between gap-1.5">
          <div className="text-zinc-100 text-sm self-stretch whitespace-nowrap bg-blue-500 w-[30px] max-w-full pl-2 pr-2.5 py-1 rounded-md">
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
        </div>
      </li>
    );
  }


export default function ActionReactions(props: {recorded: ActionAndReactions[], engine?: Engine}) {
    return (
      <div>
        <ul>
            {props.recorded.map((actionAndReaction) => {
                if(actionAndReaction.action) {
                    return ActionCard(actionAndReaction.action);
                }
            })}
        </ul>
          <form>
          <fieldset>
            <legend>dispatch an event</legend>
            {props.engine?.askForBids?.map(bid => (
              <div>
                <input type="radio" name="eventId" value={bid.event.id} required/>
                <label for={bid.event.id}>{bid.event.id}</label>
              </div>
            ))}
          </fieldset>
          <textarea name="payload" cols={50} rows={10}></textarea>
          <button onClick={() => {
            console.log('click', props.engine)
            const event = props.engine?.askForBids[0].event;
            event?.registerCallback(() => console.log('test: ', event.value));
            event?.dispatch(1009)
          }
          } type="button">Dispatch</button>
        </form>
      </div>
    )
}

