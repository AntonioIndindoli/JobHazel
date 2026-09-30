export default async function teardown() {
    const response = await fetch("http://127.0.0.1:4100/__e2e/cleanup", {
        method: "POST", headers: { Authorization: `Bearer ${process.env.E2E_CONTROL_TOKEN}` },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("E2E account cleanup failed.");
}
