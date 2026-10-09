// Tests for mermaid-check: diagrams in temporary files, checked with the real mermaid from package.json.
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const SCRIPT = path.join(__dirname, "..", "bin", "mermaid-check");

const VALID = `sequenceDiagram
  participant F as Frontend
  F->>B: POST /click
  alt value < MAX
    B-->>F: 200
  else
    B-->>F: 422
  end`;

// Error on the second line of the diagram: "els" instead of "else".
const BROKEN = `sequenceDiagram
  els
  end`;

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mermaid-check-test-"));
}

function run(args, { cwd } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
}

test("valid diagrams pass, .mmd files and directories are checked too", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "spec.md"), `# Feature\n\n\`\`\`mermaid\n${VALID}\n\`\`\`\n`);
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "sub", "flow.mmd"), "flowchart TD\n  A-->B\n");
  const result = run([dir]);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /No errors \(diagrams: 2, files: 2\)/);
});

test("an error is reported with the line number in the file", () => {
  const file = path.join(tempDir(), "spec.md");
  // File lines: 1 heading, 2 empty, 3 fence, 4 "sequenceDiagram", 5 "els".
  fs.writeFileSync(file, `# Feature\n\n\`\`\`mermaid\n${BROKEN}\n\`\`\`\n`);
  const result = run([file]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:5: `));
  assert.match(result.stdout, /Errors: 1/);
});

test("syntax newer than GitLab's mermaid is rejected", () => {
  const file = path.join(tempDir(), "arch.md");
  fs.writeFileSync(file, "```mermaid\narchitecture-beta\n  service db(database)[DB]\n```\n");
  assert.equal(run([file]).status, 1);
});

test("block diagram is rejected: mermaid parses it, but GitLab 18.1 does not render it", () => {
  const file = path.join(tempDir(), "block.md");
  // File lines: 1 fence, 2–4 front matter, 5 directive, 6 "block-beta".
  fs.writeFileSync(file, "```mermaid\n---\ntitle: Blocks\n---\n%%{init: {}}%%\nblock-beta\n  columns 2\n  a b\n```\n");
  const result = run([file]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /block\.md:6: block-beta: GitLab will not render this diagram/);
  assert.doesNotMatch(result.stdout, /Lex:|Rule:/, "parser debug output is not printed");
});

test("a mermaid example inside another code block is not checked", () => {
  const file = path.join(tempDir(), "doc.md");
  fs.writeFileSync(file, `\`\`\`\`md\n\`\`\`mermaid\n${BROKEN}\n\`\`\`\n\`\`\`\`\n\n~~~mermaid\n${VALID}\n~~~\n`);
  const result = run([file]);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /diagrams: 1/);
});

test("without arguments the whole repository is checked, even from a subdirectory", () => {
  const repo = tempDir();
  assert.equal(spawnSync("git", ["init", "-q", repo]).status, 0);
  fs.mkdirSync(path.join(repo, "docs"));
  fs.writeFileSync(path.join(repo, "docs", "ok.md"), `\`\`\`mermaid\n${VALID}\n\`\`\`\n`);
  fs.writeFileSync(path.join(repo, "broken.md"), `\`\`\`mermaid\n${BROKEN}\n\`\`\`\n`);
  const result = run([], { cwd: path.join(repo, "docs") });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /\.\.\/broken\.md:3: /);
});

test("invalid usage exits with code 2", () => {
  assert.equal(run(["--bad"]).status, 2);
  assert.equal(run([path.join(tempDir(), "nope.md")]).status, 2);
});
