import { Engine, Event } from "../../core/index.ts";

export default function EventDispatcher({dispatch}: {dispatch: (value: any) => void}) {
    const handleDispatch = (value: any) => {
        console.log('dispatch: ', dispatch)
        console.log('dispatching event',dispatch(value));
        return false;
    }
    return <div>
        <button type="button" onClick={() => handleDispatch(123)}>Dispatch2</button>
    </div>
}