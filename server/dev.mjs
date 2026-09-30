/**
 * `npm run dev:all` — start the API server and Vite together with prefixed,
 * interleaved output and a single Ctrl+C that stops both. Zero dependencies.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const procs = [
  ["api", spawn(process.execPath, ["server/index.mjs"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] })],
  ["web", spawn("npx", ["vite"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" })]
];

const prefix = (name) => (line) => process.stdout.write(`[${name}] ${line}\n`);
for (const [name, p] of procs) {
  const out = prefix(name), err = prefix(name);
  p.stdout.setEncoding("utf8");
  p.stderr.setEncoding("utf8");
  p.stdout.on("data", (d) => d.split("\n").filter(Boolean).forEach(out));
  p.stderr.on("data", (d) => d.split("\n").filter(Boolean).forEach(err));
  p.on("exit", (code) => {
    process.stdout.write(`[${name}] exited (${code})\n`);
    stopAll(code ?? 0);
  });
}

function stopAll(code) {
  for (const [, p] of procs) { if (!p.killed) p.kill("SIGTERM"); }
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
