import {WebClientClient} from "../generated-ts-client.ts";
import {getAccessToken} from "./auth.ts";

const BASE_URL = import.meta.env.VITE_API_URL;

const authenticatedHttp = {
    fetch: async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
        const token = getAccessToken();
        const headers = new Headers(init?.headers ?? {});

        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        return fetch(url, {
            ...init,
            headers
        });
    }
};

export const createWebClient = () => new WebClientClient(BASE_URL, authenticatedHttp);

export const getSseUrl = () => `${BASE_URL}/sse`;

