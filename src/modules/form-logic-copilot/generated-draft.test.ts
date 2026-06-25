import { describe, expect, it } from "vitest"

import { parseGeneratedDraft } from "@/modules/form-logic-copilot/generated-draft"

describe("Form Logic Copilot generated draft parser", () => {
  it("parses compact JSON drafts", () => {
    expect(
      parseGeneratedDraft(
        JSON.stringify({
          logicalName: "new_accountformlogic.js",
          source: "var OpenDataverse = OpenDataverse || {};",
        }),
      ),
    ).toMatchObject({
      logicalName: "new_accountformlogic.js",
      source: "var OpenDataverse = OpenDataverse || {};",
    })
  })

  it("recovers embedded JSON when provider text precedes it", () => {
    expect(
      parseGeneratedDraft(`Codex generated this draft:
{
  "source": "var OpenDataverse = OpenDataverse || {};\\nfunction onLoad(executionContext) { executionContext.getFormContext(); }"
}`),
    ).toMatchObject({
      source:
        "var OpenDataverse = OpenDataverse || {};\nfunction onLoad(executionContext) { executionContext.getFormContext(); }",
    })
  })

  it("recovers JavaScript from a fenced script block", () => {
    expect(
      parseGeneratedDraft(`Codex generated this script:
\`\`\`javascript
var OpenDataverse = OpenDataverse || {};
function onLoad(executionContext) {
  executionContext.getFormContext();
}
\`\`\``),
    ).toMatchObject({
      source:
        "var OpenDataverse = OpenDataverse || {};\nfunction onLoad(executionContext) {\n  executionContext.getFormContext();\n}",
    })
  })
})
