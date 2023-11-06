import { Handlers } from "$fresh/server.ts";
import { PageProps } from "$fresh/server.ts";
import { ActionAndReactions } from "../../../core/index.ts";
import { TestRecord, runTests } from "../../tests/utils.ts";


export const handler: Handlers<ActionAndReactions[]> = {
    async GET(_req, ctx) {
        try {
            const fileName = ctx.params.id;
            const test: {default: TestRecord} = await import(`../../tests/${fileName}.ts`);
            const {recorded, result} = await runTests(test.default["a given bid will"]());
            return ctx.render(recorded);
        }
        catch(error) {
            // in this case, an assert failed
            console.error('test failed');
            return ctx.render([]);
        }
    },
};


function ActionCard(eventId: string) {
  return (
    <li className="shadow-sm bg-zinc-100 flex items-start justify-between gap-5 pr-3 rounded-md">
      <div className="self-stretch flex items-start justify-between gap-1.5">
        <div className="text-zinc-100 text-sm self-stretch whitespace-nowrap bg-blue-500 w-[30px] max-w-full pl-2 pr-2.5 py-1 rounded-md">
          31
        </div>
        <div className="text-black text-base self-center whitespace-nowrap my-auto">
          {eventId}
        </div>
      </div>
      <div className="self-center flex items-start gap-1.5 my-auto">
        <div
          className="bg-green flex h-2 w-full flex-col flex-1 rounded-md"
        ></div>
        <div className="text-neutral-500 text-xs self-stretch whitespace-nowrap">
          31
        </div>
      </div>
    </li>
  );
}


/**
 * a page that renders a list of actions and the corresponding reactions
 * @param props 
 * @returns a visualization of the ActionAndReactions array
 */
export default function actionsAndReactionsPage(props: PageProps<ActionAndReactions[]>) {
    return (
        <div>
            <h1>Actions and Reactions</h1>
            <ul>
                {props.data.map((actionAndReaction) => {
                    return ActionCard(actionAndReaction.action?.eventId || '');
                })}
            </ul>
        </div>
    );
}