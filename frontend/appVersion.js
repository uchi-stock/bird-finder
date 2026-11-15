import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * バージョンを「<major>.<minor>.<mainのコミット数>」にする（例: 0.1.57）。
 * package.jsonのversionはmajor.minorの基準として使い、PRのマージ（squash）ごとに末尾が増える。
 * semantic-release等による正式なバージョン管理を導入するまでの暫定対応。
 */
export function computeVersion(base, commitCount) {
  const m = /^(\d+)\.(\d+)\./.exec(base);
  if (!m || !Number.isInteger(commitCount) || commitCount <= 0) return base;
  return `${m[1]}.${m[2]}.${commitCount}`;
}

const defaultRun = (cmd) => execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });

/** コミット数を返す。浅い履歴（数が不正確になる）・git無し・失敗時はnull */
export function gitCommitCount(run = defaultRun) {
  try {
    if (run("git rev-parse --is-shallow-repository").trim() === "true") return null;
    const n = Number.parseInt(run("git rev-list --count HEAD").trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** 環境変数APP_VERSIONがあればそれを優先する */
export function resolveVersion(baseVersion, env = process.env, run = defaultRun) {
  return env.APP_VERSION || computeVersion(baseVersion, gitCommitCount(run));
}

/** package.jsonのversionを読み、バージョンを決める（vite.config.tsから使う） */
export function resolveVersionFromPackage(packageJsonUrl, env = process.env, run = defaultRun) {
  return resolveVersion(JSON.parse(readFileSync(packageJsonUrl, "utf-8")).version, env, run);
}
