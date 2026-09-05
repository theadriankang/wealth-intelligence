import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, clientIp } from "./rate-limit.js";

// Each test uses its own key — checkRateLimit's bucket map is a module-level singleton, so
// reusing a key across tests would let one test's requests count toward another's limit.
let n = 0;
const key = () => `test-key-${++n}`;

test("requests within the limit are allowed", () => {
  const k = key();
  for (let i = 0; i < 5; i++) {
    const r = checkRateLimit(k, { limit: 5 });
    assert.equal(r.allowed, true, `request ${i + 1} of 5 should be allowed`);
  }
});

test("the request one past the limit is rejected", () => {
  const k = key();
  for (let i = 0; i < 5; i++) checkRateLimit(k, { limit: 5 });
  const sixth = checkRateLimit(k, { limit: 5 });
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.remaining, 0);
  assert.ok(sixth.retryAfterSec >= 1);
});

test("remaining counts down correctly as requests are made", () => {
  const k = key();
  assert.equal(checkRateLimit(k, { limit: 3 }).remaining, 2);
  assert.equal(checkRateLimit(k, { limit: 3 }).remaining, 1);
  assert.equal(checkRateLimit(k, { limit: 3 }).remaining, 0);
});

test("the window resets after windowMs elapses", async () => {
  const k = key();
  for (let i = 0; i < 3; i++) checkRateLimit(k, { limit: 3, windowMs: 30 });
  assert.equal(checkRateLimit(k, { limit: 3, windowMs: 30 }).allowed, false);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(checkRateLimit(k, { limit: 3, windowMs: 30 }).allowed, true);
});

test("different keys have independent buckets", () => {
  const a = key(), b = key();
  for (let i = 0; i < 5; i++) checkRateLimit(a, { limit: 5 });
  assert.equal(checkRateLimit(a, { limit: 5 }).allowed, false, "a is exhausted");
  assert.equal(checkRateLimit(b, { limit: 5 }).allowed, true, "b is untouched");
});

test("clientIp prefers x-forwarded-for and takes the first address in the list", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } };
  assert.equal(clientIp(req), "203.0.113.7");
});

test("clientIp falls back to req.ip when there's no x-forwarded-for", () => {
  const req = { headers: {}, ip: "127.0.0.1" };
  assert.equal(clientIp(req), "127.0.0.1");
});

test("clientIp falls back to the raw socket address, then to a constant, when nothing else is set", () => {
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: "10.1.2.3" } }), "10.1.2.3");
  assert.equal(clientIp({ headers: {} }), "unknown");
});
