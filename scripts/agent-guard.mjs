// ──────────────────────────────────────────────────────────────
// Agent guard — refuse to run a mutating script inside an
// AI-agent session.
//
// The operator's dev environment is not the agent's to mutate
// (writing env files, spinning Docker containers, killing dev
// servers, applying migrations against the live DB, etc.). The
// agent should propose changes; the human runs them.
//
// Detection is heuristic: any of a handful of well-known
// agent-marker env vars present (CLAUDECODE=1, AI_AGENT, etc.).
// The human bypasses with --i-am-the-human, which is consumed
// from process.argv before the caller sees it.
//
// See AI_README_FIRST.MD §0 (top banner) + §7 for the policy.
// ──────────────────────────────────────────────────────────────

const AGENT_ENV_VARS = [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'AI_AGENT',
    'ANTHROPIC_AGENT',
];

const BYPASS_FLAG = '--i-am-the-human';

function detectAgentSession() {
    return AGENT_ENV_VARS.filter((k) => process.env[k]);
}

function consumeBypassFlag() {
    const idx = process.argv.indexOf(BYPASS_FLAG);
    if (idx === -1) return false;
    process.argv.splice(idx, 1);
    return true;
}

/**
 * Refuse to run when invoked from an AI-agent session.
 *
 * @param {object} opts
 * @param {string} opts.scriptName - e.g. "scripts/setup.mjs"
 * @param {string} opts.mutates    - One-line summary of what the script changes.
 */
export function refuseInAgentSession({ scriptName, mutates }) {
    const hits = detectAgentSession();
    if (hits.length === 0) return;
    if (consumeBypassFlag()) return;

    const red = (s) => `\x1b[31m${s}\x1b[0m`;
    const bold = (s) => `\x1b[1m${s}\x1b[0m`;
    process.stderr.write(`\n${red(`🛑 ${scriptName} refused to run in an AI-agent session.`)}\n\n`);
    process.stderr.write(`Detected agent marker(s): ${hits.join(', ')}\n\n`);
    process.stderr.write(`${bold('What this script does:')} ${mutates}\n`);
    process.stderr.write(
        `${bold('Why this guard exists:')} the operator's dev environment is not the agent's to mutate.\n` +
            `The agent should propose changes; the human runs them. See AI_README_FIRST.MD §7.\n\n`,
    );
    process.stderr.write(
        `If you are the human operator and this heuristic misfired, re-run with ${bold(BYPASS_FLAG)}.\n\n`,
    );
    process.exit(1);
}
