import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const artifactDirectory = path.join(root, "artifacts");
const vsix = path.join(artifactDirectory, "palantir-java-format-worker-0.1.0.vsix");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("npm_execpath is unavailable; run this script through 'npm run package'.");
}
run(process.execPath, [npmCli, "run", "verify"]);
mkdirSync(artifactDirectory, { recursive: true });
run(process.execPath, [
  path.join(root, "node_modules", "@vscode", "vsce", "vsce"),
  "package",
  "--out",
  vsix
]);

if (!existsSync(vsix)) {
  throw new Error(`VSIX was not produced: ${vsix}`);
}
const listing = spawnSync("jar", ["tf", vsix], { cwd: root, encoding: "utf8", shell: false });
if (listing.error) {
  throw listing.error;
}
if (listing.status !== 0) {
  throw new Error(`Unable to inspect packaged VSIX: ${listing.stderr}`);
}
const packagedFiles = new Set(listing.stdout.split(/\r?\n/u));
for (const requiredEntry of [
  "extension/dist/worker/palantir-formatter-worker.jar",
  "extension/THIRD_PARTY_NOTICES.txt"
]) {
  if (!packagedFiles.has(requiredEntry)) {
    throw new Error(`Packaged VSIX is missing required file: ${requiredEntry}`);
  }
}
console.log(`Verified VSIX: ${vsix}`);
