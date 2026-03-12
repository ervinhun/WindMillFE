const TOKEN_KEYS = ["token", "accessToken", "authToken"] as const;
const ROLE_KEYS = ["roleName", "role", "userRole"] as const;

export const getAccessToken = (): string | null => {
    if (typeof window === "undefined") return null;

    for (const key of TOKEN_KEYS) {
        const value = localStorage.getItem(key);
        if (value) return value;
    }

    return null;
};

const parseRoleFromToken = (token: string): string | null => {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    try {
        const raw = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const json = JSON.parse(raw) as Record<string, unknown>;
        const role =
            json.role ??
            json.roleName ??
            json["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

        return typeof role === "string" ? role : null;
    } catch {
        return null;
    }
};

export const getCurrentRole = (): string => {
    if (typeof window === "undefined") return "viewer";

    for (const key of ROLE_KEYS) {
        const value = localStorage.getItem(key);
        if (value) return value.toLowerCase();
    }

    const token = getAccessToken();
    if (!token) return "viewer";

    return parseRoleFromToken(token)?.toLowerCase() ?? "viewer";
};

export const isAuthenticated = (): boolean => Boolean(getAccessToken());

