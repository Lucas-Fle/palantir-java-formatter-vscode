import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync
} from "node:fs";
import path from "node:path";

import {
  formatterVersion,
  root,
  workerJarName
} from "./project-metadata.mjs";

const source = path.join(root, "worker", "target", workerJarName);
const destinationDirectory = path.join(root, "dist", "worker");
const destination = path.join(destinationDirectory, workerJarName);
const pomPath = path.join(root, "worker", "pom.xml");
const noticesPath = path.join(root, "THIRD_PARTY_NOTICES.txt");

if (!existsSync(source)) {
  throw new Error(`Worker JAR is missing: ${source}. Run npm run build:worker first.`);
}

function latestMtime(target) {
  const stats = statSync(target);
  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }
  return Math.max(...readdirSync(target).map((name) => latestMtime(path.join(target, name))));
}

const newestInput = Math.max(
  latestMtime(path.join(root, "worker", "src")),
  latestMtime(pomPath),
  latestMtime(noticesPath)
);
if (statSync(source).mtimeMs < newestInput) {
  throw new Error("Worker JAR is older than its sources, pom.xml, or third-party notices.");
}

const java = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
  : process.platform === "win32"
    ? "java.exe"
    : "java";
const probe = spawnSync(java, ["-jar", source], {
  encoding: "utf8",
  input:
    '{"protocolVersion":1,"id":"verify","method":"initialize","params":{}}\n' +
    '{"protocolVersion":1,"id":"shutdown","method":"shutdown","params":{}}\n',
  shell: false,
  timeout: 15_000
});
if (probe.error) {
  throw probe.error;
}
if (probe.status !== 0) {
  throw new Error(`Worker JAR probe failed: ${probe.stderr}`);
}
const firstLine = probe.stdout.trim().split(/\r?\n/u)[0];
const response = JSON.parse(firstLine);
if (response.result?.formatterVersion !== formatterVersion) {
  throw new Error(
    `Worker reports Palantir ${String(response.result?.formatterVersion)}, expected ${formatterVersion}.`
  );
}

const jarListing = spawnSync("jar", ["tf", source], {
  encoding: "utf8",
  shell: false
});
if (jarListing.error) {
  throw jarListing.error;
}
if (jarListing.status !== 0) {
  throw new Error(`Unable to inspect worker JAR: ${jarListing.stderr}`);
}
for (const requiredEntry of ["META-INF/NOTICE", "META-INF/THIRD_PARTY_NOTICES.txt"]) {
  if (!jarListing.stdout.split(/\r?\n/u).includes(requiredEntry)) {
    throw new Error(`Worker JAR is missing required legal file: ${requiredEntry}`);
  }
}

mkdirSync(destinationDirectory, { recursive: true });
for (const name of readdirSync(destinationDirectory)) {
  if (name.endsWith(".jar") && name !== workerJarName) {
    rmSync(path.join(destinationDirectory, name));
  }
}
copyFileSync(source, destination);
console.log(`Copied verified Palantir ${formatterVersion} worker to ${destination}`);
