import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { root } from "./project-metadata.mjs";

const worker = path.join(root, "worker");
const wrapper = path.join(worker, ".mvn", "wrapper", "maven-wrapper.jar");

if (!existsSync(wrapper)) {
  throw new Error(`Maven Wrapper is missing: ${wrapper}`);
}

const java = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
  : process.platform === "win32"
    ? "java.exe"
    : "java";
const result = spawnSync(java, [
  `-Dmaven.multiModuleProjectDirectory=${worker}`,
  "-classpath",
  wrapper,
  "org.apache.maven.wrapper.MavenWrapperMain",
  "-B",
  "clean",
  "package"
], {
  cwd: worker,
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
