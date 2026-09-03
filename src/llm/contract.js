/**
 * THE LLM CONTRACT.
 *
 * Rule: no claim renders without a citation to a real signal event id.
 * The model does not get to invent facts; it gets to arrange ours into prose.
 * This is the difference between a demo a bank can look at and one it can't.
 */

export const BRIEF_SCHEMA = {
  type: "object",
  required: ["headline", "sections", "confidence"],
  properties: {
    headline: { type: "string", maxLength: 200 },
    sections: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "claims"],
        properties: {
          title: { type: "string" },
          claims: {
            type: "array",
            items: {
              type: "object",
              required: ["text", "citations"],
              properties: {
                text: { type: "string" },
                citations: {
                  type: "array",
                  minItems: 1,
                  items: { type: "string", description: "SignalEvent.id" }
                }
              }
            }
          }
        }
      }
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    caveats: { type: "array", items: { type: "string" } }
  }
};

export const SUITABILITY_SCHEMA = {
  type: "object",
  required: ["objective", "riskFit", "knowledge", "concentration", "costs"],
  properties: {
    objective: { type: "string" }, riskFit: { type: "string" },
    knowledge: { type: "string" }, concentration: { type: "string" },
    costs: { type: "string" }
  }
};
