import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../app.js";

test("imports accept maximum UTF-8/escaped captures while body limits remain bounded", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (route, rawText) => fetch(`${url}${route}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawText }),
  });
  try {
    // No credentials: reaching the auth middleware proves the JSON was accepted,
    // without touching a provider, database or stored draft.
    for (const text of ["界".repeat(100_000), "\u0001".repeat(100_000)]) {
      assert.equal((await send("/imports/create-draft", text)).status, 401);
      assert.equal((await send("/imports/test/convert", text)).status, 401);
    }
    assert.equal((await send("/imports/create-draft", "a".repeat(1_100_000))).status, 413);
    assert.equal((await send("/auth/extension/refresh", "a".repeat(110_000))).status, 413);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
