import { writeActorsJson, installDevcontainer, type GenerateArgs } from './claude-code.js';

export async function generateCursorAgent(args: GenerateArgs): Promise<void> {
  writeActorsJson({
    cwd: args.cwd,
    spaceId: args.installResp.space_id,
    spaceName: args.installResp.space_name ?? args.installResp.space_id,
    apiUrl: args.apiUrl,
    adopted: args.installResp.actors,
  });
  console.log(
    `Wrote .moot/actors.json        (${Object.keys(args.installResp.actors).length} agents, chmod 600)`,
  );
  installDevcontainer({
    cwd: args.cwd,
    templateName: 'cursor-agent-devcontainer',
    overwrite: false,
  });
}
