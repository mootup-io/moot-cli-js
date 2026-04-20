#!/usr/bin/env node
import { Command } from 'commander';
import { cmdLogin } from './commands/login.js';
import { cmdInit } from './commands/init.js';
import { cmdUp } from './commands/up.js';
import { cmdDown } from './commands/down.js';
import { cmdStatus } from './commands/status.js';
import { cmdAttach } from './commands/attach.js';
import { cmdCompact } from './commands/compact.js';
import { cmdLogout } from './commands/logout.js';
import { cmdRefresh } from './commands/refresh.js';

const program = new Command();

program
  .name('mootup')
  .description('Host-side operator CLI for the Moot agent team workflow')
  .version('0.1.0-rc.0');

program
  .command('login')
  .description('Authenticate against mootup.io and store credential')
  .option('--token <pat>', 'Personal access token (prompts if omitted)')
  .option('--api-url <url>', 'Moot API URL', 'https://mootup.io')
  .option('--profile <name>', 'Named profile (default "default")')
  .action((opts) => cmdLogin(opts));

program
  .command('init')
  .description('Authenticate (OAuth), select harness + archetype, install team, write .moot/actors.json')
  .option('--force', 'Rotate keys for already-keyed agents (destructive)', false)
  .option('--yes', 'Skip all confirmation prompts', false)
  .option('--api-url <url>', 'Moot API URL (overrides stored credential)')
  .option('--profile <name>', 'Named profile (default "default")')
  .option('--archetype <id>', 'Archetype to install (skips prompt)')
  .option(
    '--harness <name>',
    'Harness integration (claude-code, cursor-agent, cursor-ide, sdk)',
    'claude-code',
  )
  .option('--show-token', 'For --harness sdk, print the full PAT plaintext', false)
  .action((opts) => cmdInit(opts));

program
  .command('logout')
  .description('Revoke OAuth installation and clear local credential')
  .option('--profile <name>', 'Named profile (default "default")')
  .option('--all', 'Revoke all installations (alias for logout; multi-install deferred)', false)
  .action((opts) => cmdLogout(opts));

program
  .command('refresh')
  .description('Refresh the stored OAuth access token')
  .option('--profile <name>', 'Named profile (default "default")')
  .action((opts) => cmdRefresh(opts));

program
  .command('up')
  .description('Bring the devcontainer up and start the agent team')
  .action(() => cmdUp({}));

program
  .command('down [role]')
  .description('Stop agents (optionally a specific role)')
  .action((role) => cmdDown({ role }));

program
  .command('status')
  .description('Show running agents')
  .action(() => cmdStatus({}));

program
  .command('attach <role>')
  .description('Attach to a role\'s tmux session')
  .action((role) => cmdAttach({ role }));

program
  .command('compact [role]')
  .description('Compact a role\'s context (all roles if omitted)')
  .action((role) => cmdCompact({ role }));

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
