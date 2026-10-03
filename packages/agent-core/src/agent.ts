import { stepCountIs, ToolLoopAgent, type LanguageModel, type ToolSet } from "ai";

import { buildAgentInstructions } from "./instructions";
import { createReceptionistTools, type AgentToolContext } from "./tools";

export type ReceptionistAgent = ToolLoopAgent<never, ToolSet>;

export function createReceptionistAgent(input: { model: LanguageModel; context: AgentToolContext; extraInstructions?: string; readOnly?: boolean }): ReceptionistAgent {
  const tools = createReceptionistTools(input.context);
  return new ToolLoopAgent({
    model: input.model,
    instructions: [buildAgentInstructions(input.context.snapshot, input.context.channel, { intakeOnly: input.context.intakeOnly ?? false }), input.extraInstructions].filter(Boolean).join("\n\n"),
    tools: input.readOnly ? Object.fromEntries(Object.entries(tools).filter(([name]) => ["getBusinessHours", "getBusinessServices", "searchKnowledge"].includes(name))) : tools,
    // One lookup, maybe a second, then the answer. Voice callers are waiting.
    stopWhen: stepCountIs(4),
  });
}
