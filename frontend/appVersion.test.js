import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeVersion, gitCommitCount, resolveVersion, resolveVersionFromPackage } from "./appVersion.js";

const runner = (map) => (cmd) => {
  if (!(cmd in map)) throw new Error(`unexpected: ${cmd}`);
  const v = map[cmd];
  if (v instanceof Error) throw v;
  return v;
};

describe("computeVersion", () => {
  it("major.minorに、コミット数を末尾として付ける", () => {
    expect(computeVersion("0.1.0", 57)).toBe("0.1.57");
    expect(computeVersion("2.13.5", 100)).toBe("2.13.100");
  });
  it("コミット数が不正（無い・0以下・小数）なら基準のまま", () => {
    for (const bad of [null, undefined, 0, -3, 1.5, NaN]) expect(computeVersion("0.1.0", bad)).toBe("0.1.0");
  });
  it("基準の形式が不正ならそのまま返す", () => {
    expect(computeVersion("abc", 10)).toBe("abc");
  });
});

describe("gitCommitCount", () => {
  it("全履歴ならコミット数を返す", () => {
    expect(gitCommitCount(runner({ "git rev-parse --is-shallow-repository": "false\n", "git rev-list --count HEAD": "57\n" }))).toBe(57);
  });
  it("浅い履歴は数が不正確になるためnull", () => {
    expect(gitCommitCount(runner({ "git rev-parse --is-shallow-repository": "true\n" }))).toBeNull();
  });
  it("gitが使えない・数が読めない場合はnull", () => {
    expect(gitCommitCount(runner({ "git rev-parse --is-shallow-repository": new Error("no git") }))).toBeNull();
    expect(gitCommitCount(runner({ "git rev-parse --is-shallow-repository": "false", "git rev-list --count HEAD": "x" }))).toBeNull();
    expect(gitCommitCount(runner({ "git rev-parse --is-shallow-repository": "false", "git rev-list --count HEAD": "0" }))).toBeNull();
  });
});

describe("resolveVersion", () => {
  const full = runner({ "git rev-parse --is-shallow-repository": "false", "git rev-list --count HEAD": "57" });
  it("環境変数APP_VERSIONがあれば最優先", () => {
    expect(resolveVersion("0.1.0", { APP_VERSION: "9.9.9" }, full)).toBe("9.9.9");
  });
  it("無ければコミット数から作る。数えられなければ基準のまま", () => {
    expect(resolveVersion("0.1.0", {}, full)).toBe("0.1.57");
    expect(resolveVersion("0.1.0", {}, runner({ "git rev-parse --is-shallow-repository": "true" }))).toBe("0.1.0");
  });
});

describe("resolveVersionFromPackage", () => {
  const pkgPath = fileURLToPath(new URL("./package.json", import.meta.url));
  it("package.jsonのversionを基準にして、コミット数から作る", () => {
    const full = runner({ "git rev-parse --is-shallow-repository": "false", "git rev-list --count HEAD": "57" });
    expect(resolveVersionFromPackage(pkgPath, {}, full)).toMatch(/^0\.1\.57$/);
    expect(resolveVersionFromPackage(pkgPath, { APP_VERSION: "3.0.0" }, full)).toBe("3.0.0");
  });
});
