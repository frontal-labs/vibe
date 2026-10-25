/**
 * Wrap a tool's output before it is shown to the model. Tool results are data produced by
 * code that may read untrusted sources (web pages, tickets, files), so they can carry
 * instructions aimed at the model ("ignore your rules and..."). Framing marks the boundary so
 * the model can treat the content as data. This is a mitigation, not a guarantee: the model
 * must still be instructed to ignore instructions inside tool output, and policy checks — not
 * prompts — are what actually stop a harmful action.
 */
export function frameUntrustedOutput(toolName: string, content: string): string {
  const name = toolName.replace(/[^\w.-]/g, "")
  // Escape any closing tag inside the payload so it cannot end the frame early.
  const body = content.replace(/<\/tool_output/gi, "<\\/tool_output")
  return `<tool_output tool="${name}" trust="untrusted">\n${body}\n</tool_output>`
}
