// One transport for the static frontend. Neon's session is held in the API's
// HttpOnly cookie; the UI's auth marker is never sent as a bearer credential.
export function sessionFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (headers.get("Authorization") === "Bearer cookie-session") headers.delete("Authorization");
    return fetch(input, { ...init, headers, credentials: "include" });
}
