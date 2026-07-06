import { readFileSync } from "node:fs";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "..");

const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const pom = readFileSync(path.join(root, "worker", "pom.xml"), "utf8");

function pomValue(expression, label) {
  const value = expression.exec(pom)?.[1];
  if (!value) {
    throw new Error(`Unable to read ${label} from worker/pom.xml.`);
  }
  return value;
}

export const extensionName = packageJson.name;
export const extensionVersion = packageJson.version;
export const workerVersion = pomValue(
  /<artifactId>palantir-formatter-worker<\/artifactId>\s*<version>([^<]+)<\/version>/u,
  "worker version"
);
export const workerJarName = `${pomValue(
  /<finalName>([^<]+)<\/finalName>/u,
  "worker final name"
)}.jar`;
export const formatterVersion = pomValue(
  /<palantir-java-format\.version>([^<]+)<\/palantir-java-format\.version>/u,
  "Palantir Java Format version"
);

if (extensionVersion !== workerVersion) {
  throw new Error(
    `Version mismatch: package.json is ${extensionVersion}, worker/pom.xml is ${workerVersion}.`
  );
}
