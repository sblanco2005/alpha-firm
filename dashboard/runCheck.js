// Manual market-check trigger + status. Spawns run-check.sh (the same script cron
// runs) detached, streams its output to the day's log, and tracks run state so the
// app can poll progress. Only one manual run at a time.
import { spawn } from "child_process";
import { openSync, readFileSync, existsSync } from "fs";
import { join } from "path";

let current = null; // { session, startedAt, pid, logFile, status, exitCode, finishedAt }

export function isRunning() {
  return !!(current && current.status === "running");
}

function tailLine(logFile) {
  try {
    if (!existsSync(logFile)) return null;
    const text = readFileSync(logFile, "utf-8");
    const lines = text.trimEnd().split("\n");
    return lines[lines.length - 1] || null;
  } catch {
    return null;
  }
}

export function getRunStatus() {
  if (!current) return { running: false, last: null };
  const elapsedSec = Math.round(((current.finishedAt || Date.now()) - current.startedAt) / 1000);
  return {
    running: current.status === "running",
    session: current.session,
    status: current.status,
    startedAt: new Date(current.startedAt).toISOString(),
    elapsedSec,
    exitCode: current.exitCode ?? null,
    lastLine: current.status === "running" ? tailLine(current.logFile) : null,
  };
}

// rootDir = alpha-firm dir (where run-check.sh + logs live).
export function startRun(session, rootDir) {
  if (isRunning()) throw new Error("a market check is already running");
  const valid = ["premarket", "midday", "closing"];
  const sess = valid.includes(session) ? session : "midday";

  const today = new Date().toISOString().slice(0, 10);
  const logFile = join(rootDir, "logs", `${today}.log`);
  const scriptPath = join(rootDir, "run-check.sh");
  const out = openSync(logFile, "a");

  // run-check.sh unsets ANTHROPIC_API_KEY itself to use the Max subscription.
  const child = spawn("bash", [scriptPath, sess], {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env },
  });

  current = { session: sess, startedAt: Date.now(), pid: child.pid, logFile, status: "running", exitCode: null, finishedAt: null };

  child.on("exit", (code) => {
    current.status = code === 0 ? "success" : "error";
    current.exitCode = code;
    current.finishedAt = Date.now();
  });
  child.on("error", () => {
    current.status = "error";
    current.exitCode = -1;
    current.finishedAt = Date.now();
  });
  child.unref();

  return { session: sess, pid: child.pid };
}
