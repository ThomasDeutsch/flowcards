import { Handlers } from "$fresh/server.ts";
import { PageProps } from "$fresh/server.ts";
import { ActionAndReactions } from "../../../core/index.ts";
import { TestRecord, runTests } from "../../tests/utils.ts";


export const handler: Handlers<ActionAndReactions[]> = {
    async GET(_req, ctx) {
        const fileName = ctx.params.id;
        const test: {default: TestRecord} = await import(`../../tests/${fileName}.ts`);
        console.log('test', test);
        const {recorded, result} = await runTests(test.default["a given bid will"]());
        return ctx.render(recorded);
    },
};


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
                    return (
                        <li>
                            <h2>Reactions</h2>
                            <pre>{JSON.stringify(actionAndReaction.reactions, null, 2)}</pre>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}