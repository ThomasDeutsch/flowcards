import { wait, intercept, request, block } from "./src/bid";
import { getOverrides } from "./src/overrideinfo";
import { createUpdateLoop } from "./src/updateloop";
import { Logger } from "./src/logger";

const userApi = {
    createUpdateLoop: createUpdateLoop,
    getOverrides: getOverrides,
    Logger: Logger,
    wait: wait,
    intercept: intercept,
    request: request,
    block: block
};

export default userApi;