import { access } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import os from "node:os";
import { spawn as defaultSpawn } from "node:child_process";

const ALLOWED_SCRIPT_NAME = "a.ps1";

const defaultScriptPath = (homeDirectory = os.homedir()) =>
  join(homeDirectory, "Downloads", ALLOWED_SCRIPT_NAME);

export function createPowerShellRunner({
  scriptPath = "",
  homeDirectory = os.homedir(),
  platform = process.platform,
  spawnProcess = defaultSpawn,
  fileAccess = access,
} = {}) {
  const configuredPath = String(scriptPath || "").trim();
  const file = resolve(configuredPath || defaultScriptPath(homeDirectory));
  let child = null;

  const running = () => Boolean(child && child.exitCode === null && !child.killed);

  const start = async () => {
    if (platform !== "win32")
      throw new Error("Lệnh PowerShell chỉ được phép chạy trên Windows.");
    if (basename(file).toLowerCase() !== ALLOWED_SCRIPT_NAME)
      throw new Error("Chỉ cho phép chạy script a.ps1 đã được cấu hình.");
    if (running()) return { started: false, running: true, path: file };
    await fileAccess(file);
    child = spawnProcess(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file],
      { windowsHide: true, detached: false, stdio: "ignore" },
    );
    child.once?.("exit", () => {
      child = null;
    });
    child.once?.("error", () => {
      child = null;
    });
    return { started: true, running: true, path: file };
  };

  const stop = () => {
    if (!running()) {
      child = null;
      return { stopped: false, running: false, path: file };
    }
    child.kill();
    child = null;
    return { stopped: true, running: false, path: file };
  };

  return { start, stop, isRunning: running, scriptPath: file };
}

