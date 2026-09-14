// Syntax-check every JavaScript file under extension/ and every test runner,
// the same `node --check` on every platform (npm on Windows runs scripts
// through cmd.exe, which cannot run a bash loop).
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
function walk(dir, exts) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "vendor") walk(p, exts);
    } else if (exts.some((e) => name.endsWith(e))) {
      files.push(p);
    }
  }
}
walk(path.join(root, "extension"), [".js"]);
walk(path.join(root, "tests", "ext_fixtures"), [".mjs"]);

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    failed += 1;
    console.log(`FAIL ${path.relative(root, f)}\n${String(e.stderr || e.message)}`);
  }
}
console.log(`${files.length - failed}/${files.length} files pass node --check`);
process.exit(failed ? 1 : 0);
