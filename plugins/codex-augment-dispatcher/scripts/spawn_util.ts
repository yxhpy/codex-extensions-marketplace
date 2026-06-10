import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process";

function shouldRouteThroughCmd(command: string): boolean {
	if (process.platform !== "win32") return false;
	const trimmed = command.trim();
	if (!trimmed) return false;
	// Node can spawn native executables directly on Windows, but .cmd/.bat shims
	// (including npm/npx/claude/grok/agy/codex installs) require cmd.exe.
	return !/\.(?:exe|com)$/i.test(trimmed);
}

function quoteWindowsCmdArg(value: string): string {
	// cmd.exe expands %VAR% even inside quotes; double percent signs so prompts
	// and paths containing % survive when routed through npm-style .cmd shims.
	const escaped = value.replace(/%/g, "%%").replace(/"/g, '""');
	return `"${escaped}"`;
}

export function spawnCliSync(
	command: string,
	args: string[] = [],
	options: SpawnSyncOptions = {},
): SpawnSyncReturns<string> {
	if (shouldRouteThroughCmd(command)) {
		const cmdLine = `call ${[command, ...args].map(quoteWindowsCmdArg).join(" ")}`;
		return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", cmdLine], {
			...options,
			windowsVerbatimArguments: true,
		}) as SpawnSyncReturns<string>;
	}
	return spawnSync(command, args, options) as SpawnSyncReturns<string>;
}
