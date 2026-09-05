import test, { after } from "node:test";
import assert from "node:assert/strict";
import { generateBrief } from "./client.js";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

test("generateBrief succeeds on the first attempt without retrying", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ result: { answer: "hi" } }) };
  };
  const res = await generateBrief({ system: "s", prompt: "p", schema: {} }, { retries: 2, retryDelayMs: 1 });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data, { answer: "hi" });
  assert.equal(calls, 1);
});

test("generateBrief retries after a failure and succeeds on a later attempt", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls < 3) throw new Error("network blip");
    return { ok: true, json: async () => ({ result: { answer: "recovered" } }) };
  };
  const res = await generateBrief({ system: "s", prompt: "p", schema: {} }, { retries: 2, retryDelayMs: 1 });
  assert.equal(res.ok, true);
  assert.equal(res.data.answer, "recovered");
  assert.equal(calls, 3);
});

test("generateBrief gives up and returns ok:false after exhausting all retries", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("still down"); };
  const res = await generateBrief({ system: "s", prompt: "p", schema: {} }, { retries: 2, retryDelayMs: 1 });
  assert.equal(res.ok, false);
  assert.match(res.error, /still down/);
  assert.equal(calls, 3); // 1 initial attempt + 2 retries
});

test("generateBrief treats a non-ok HTTP response as a failure worth retrying", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 502 }; };
  const res = await generateBrief({ system: "s", prompt: "p", schema: {} }, { retries: 1, retryDelayMs: 1 });
  assert.equal(res.ok, false);
  assert.match(res.error, /502/);
  assert.equal(calls, 2); // 1 initial attempt + 1 retry
});

test("generateBrief with retries:0 makes exactly one attempt (matches the pre-retry default caller expectation)", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("down"); };
  const res = await generateBrief({ system: "s", prompt: "p", schema: {} }, { retries: 0 });
  assert.equal(res.ok, false);
  assert.equal(calls, 1);
});
