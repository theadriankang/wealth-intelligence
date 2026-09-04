/**
 * Server-side entry for the analyst walk.
 *
 * analystWalk itself moved to src/agent/walk.js so the browser can run the same
 * function over the same bundle. Re-exported here so scripts/run-agent.js and
 * anything else importing this path keep working unchanged.
 */
export { analystWalk } from "../../src/agent/walk.js";

/**
 * Model-driven path. Requires ANTHROPIC_API_KEY or OPENAI_API_KEY and the native
 * tool-use API — server/llm.js is single-shot JSON and is not sufficient. Left as
 * the explicit next step rather than half-built: the toolbox, schemas and system
 * prompt it needs are all done and tested.
 */
export async function llmWalk() {
  throw new Error("llmWalk: not implemented. The toolbox (src/agent/tools.js), schemas and system prompt (src/agent/contract.js) are ready; wire them to the Anthropic tool-use loop.");
}
