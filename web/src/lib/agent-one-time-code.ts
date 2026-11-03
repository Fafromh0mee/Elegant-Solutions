import { createHmac } from "node:crypto";

export type AgentOneTimeCodePurpose = "activation" | "maintenance";

export function hashAgentOneTimeCode(
  purpose: AgentOneTimeCodePurpose,
  code: string,
): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to hash Agent codes");

  return createHmac("sha256", secret)
    .update(`elegant-agent:${purpose}:`)
    .update(code)
    .digest("hex");
}
