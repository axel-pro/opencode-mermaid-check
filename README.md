# opencode-mermaid-check

Checks that mermaid diagrams in Markdown will render in GitLab. When GitLab cannot parse a diagram,
it shows an error box instead of the picture, and nobody notices until someone opens the page.
This package catches such diagrams early, in two ways:

- **OpenCode plugin.** After every edit of a `.md` or `.mmd` file by the agent (`edit`, `write`,
  `apply_patch` tools), the plugin checks the diagrams in that file and appends errors with line
  numbers to the tool output. The agent sees them immediately and fixes the diagram.
- **CLI `mermaid-check`.** Checks files from the terminal or CI.

Only syntax is checked, with the official mermaid parser and [jsdom](https://github.com/jsdom/jsdom)
as the DOM. Nothing is rendered, so no browser is needed.

## OpenCode plugin

Add the package to `opencode.json`; OpenCode installs it and its dependencies on startup:

```json
{
  "plugin": ["opencode-mermaid-check@0.1.0"]
}
```

Restart OpenCode after changing the version. Requires Node.js 22.13 or newer in `PATH`: the plugin runs
the check in a separate `node` process.

Example of what the agent sees after a broken edit:

```text
Mermaid check: GitLab will not render these diagrams, fix them.
docs/spec.md:5: Parse error
    ...equenceDiagram  els  end
    ----------------------^
    Expecting 'SOLID_OPEN_ARROW', 'DOTTED_OPEN_ARROW', 'SOLID_ARROW', ..., got 'NEWLINE'
Errors: 1 (diagrams: 1, files: 1)
```

## CLI

```bash
npx opencode-mermaid-check [file or directory ...]
```

Installed as a dependency, the command is `mermaid-check`:

```bash
npm install --save-dev opencode-mermaid-check
npx mermaid-check docs/
```

- Checks ` ```mermaid ` and `~~~mermaid` blocks in `.md` files and whole `.mmd` files.
  A mermaid example nested inside another code block is not treated as a diagram.
- Directories are walked recursively, skipping `.git` and `node_modules`.
- Without arguments, checks all `.md` and `.mmd` files of the current git repository, except those
  ignored by git, even when run from a subdirectory. Outside git — the current directory.
- Exit codes: `0` — no errors; `1` — some diagrams have errors or a file could not be read;
  `2` — invalid usage.

## GitLab compatibility

The check accepts the syntax rendered by **GitLab 18.1, which bundles mermaid 10.7.0**. A newer mermaid
would accept syntax that GitLab does not render, so the package pins mermaid **10.9.8**, the latest
release of the same 10.x line: it fixes the vulnerabilities of 10.7.0 and has the same syntax, with
these differences:

- **Block diagrams** (`block-beta`) were added in 10.8. The script rejects them itself — see
  `NEWER_THAN_GITLAB` in `bin/mermaid-check`.
- **`until` and the `#`, `;` characters in Gantt titles** were also added in 10.8–10.9. Mermaid 10.7.0
  parses them too but may render them differently, so the check does not catch them.

**After a GitLab upgrade**, revisit the `mermaid` version in `package.json` and the `NEWER_THAN_GITLAB`
list. The mermaid version bundled with GitLab is in its `package.json`:
`https://gitlab.com/gitlab-org/gitlab-foss/-/raw/v<version>/package.json`, key `mermaid`
(newer GitLab releases use `mermaid-v11` and later keys).

`npm audit` reports a low-severity vulnerability in KaTeX, which mermaid uses to render formulas.
The script renders nothing, and mermaid 10 does not support a newer KaTeX.

## Development

```bash
npm install
npm test
```

Tests run the CLI against diagrams in temporary files with the real mermaid from `package.json`.

## Releasing

Releases are published to npm by GitHub Actions (`.github/workflows/publish.yml`) on a `v*` tag, using
[trusted publishing](https://docs.npmjs.com/trusted-publishers): no npm token is stored in the
repository, and npm attaches provenance automatically.

npm allows configuring a trusted publisher only for an existing package, so the first release is manual:

1. `npm login && npm publish`.
2. On npmjs.com, open the package settings → Trusted Publisher → GitHub Actions, and enter the
   repository owner, `opencode-mermaid-check` and the workflow file `publish.yml`.

Every following release:

```bash
npm version patch   # or minor / major: updates package.json and creates the vX.Y.Z tag
git push --follow-tags
```

The workflow runs the tests, checks that the tag matches the version in `package.json`, and publishes.

## License

[MIT](LICENSE)
