import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * Setup script for copilot-sdk-starter.
 * This script checks if the 'copilot-sdk' skill is already installed.
 * If installed, it runs an update. Otherwise, it performs a fresh installation.
 *
 * Usage:
 *   pnpm setup [-a <agent>] ...
 *   bun run setup [-a <agent>] ...
 *
 *   -a <agent>  Specify an agent to set up. Can be used multiple times.
 *               Valid values: claude-code, github-copilot, gemini-cli
 *               Defaults to all agents if not specified.
 *
 * Examples:
 *   pnpm setup
 *   pnpm setup -a github-copilot
 *   pnpm setup -a claude-code -a gemini-cli
 *   bun run setup -a github-copilot
 */

const SKILL_NAME = 'copilot-sdk';
const SOURCE_REPO = 'github/awesome-copilot';
const ALL_AGENTS = ['claude-code', 'github-copilot', 'gemini-cli'] as const;

type Agent = typeof ALL_AGENTS[number];
type GeminiAndCopilotAgent = Exclude<Agent, 'claude-code'>;

const AGENT_DIR_MAP: Record<GeminiAndCopilotAgent, string> = {
  'github-copilot': '.github',
  'gemini-cli': '.gemini'
};

function parseAgents(): Agent[] {
  const args = process.argv.slice(2);
  const selected: Agent[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-a' && i + 1 < args.length) {
      const value = args[++i] as Agent;
      if (!ALL_AGENTS.includes(value)) {
        console.error(`❌ Invalid agent: '${value}'. Valid options: ${ALL_AGENTS.join(', ')}`);
        process.exit(1);
      }
      if (!selected.includes(value)) {
        selected.push(value);
      }
    }
  }

  return selected.length > 0 ? selected : [...ALL_AGENTS];
}

function createSymlink(agent: GeminiAndCopilotAgent, skillName: string) {
  const root = process.cwd();
  const agentDir = AGENT_DIR_MAP[agent];
  
  if (!agentDir) return;

  const target = resolve(root, '.agents', 'skills', skillName);
  const link = resolve(root, agentDir, 'skills', skillName);
  const linkDir = resolve(root, agentDir, 'skills');

  console.log(`Creating symbolic link for ${agent}: ${link} -> ${target}`);

  try {
    if (!existsSync(linkDir)) {
      mkdirSync(linkDir, { recursive: true });
    }

    if (existsSync(link)) {
      rmSync(link, { recursive: true, force: true });
    }

    symlinkSync(target, link, 'junction');
    console.log(`✅ Symbolic link for ${agent} created successfully!`);
  } catch (error) {
    console.error(`❌ Failed to create symbolic link for ${agent}:`);
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}

function main() {
  const selectedAgents = parseAgents();
  console.log(`Selected agents: ${selectedAgents.join(', ')}`);

  try {
    // Build and run the skills add command
    const agentFlags = selectedAgents.map(agent => `-a ${agent}`).join(' ');
    const command = `npx skills add ${SOURCE_REPO} -s ${SKILL_NAME} ${agentFlags} -y`;

    console.log(`Executing: ${command}`);
    execSync(command, { stdio: 'inherit' });

    // Create symlinks for selected agents that have a directory mapping
    for (const agent of selectedAgents) {
      if (agent in AGENT_DIR_MAP) {
        createSymlink(agent as GeminiAndCopilotAgent, SKILL_NAME);
      }
    }

    console.log('\n✅ Setup completed successfully!');
  } catch (error) {
    console.error('\n❌ Setup failed:');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

main();
