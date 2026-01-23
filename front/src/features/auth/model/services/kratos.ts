import { Configuration, FrontendApi } from "@ory/client";
import {kratosUrl} from "@/shared/config/kratos.ts";

export const kratos = new FrontendApi(
    new Configuration({
        basePath: kratosUrl,
        baseOptions: {
            withCredentials: true,
        },
    })
);