// AH-g: Session types + error classes for connectMootup.
// Duck-typed MCPClientLike avoids any dependency on @modelcontextprotocol/sdk
// (inv 8 — no MCP SDK package in dependencies).

export interface MCPClientLike {
  callTool(req: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<{
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  }>;
}

export class MootupNotOrientedError extends Error {
  constructor(
    message = 'Session not yet resolved — await connectMootup() first',
  ) {
    super(message);
    this.name = 'MootupNotOrientedError';
  }
}

export interface Session {
  readonly participantId: string;
  readonly spaceId: string | null;
  readonly orientationSummary: string;
  readonly tools: Record<string, never>;
}
