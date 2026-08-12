import pkg from "../../package.json";

/**
 * Build identity, shown in the Dashboard footer so a deployed build can be
 * tied back to an exact commit.
 *
 * The version is the single source of truth in package.json — bump it there
 * when cutting a release. The commit comes from Vercel's build-time system
 * env var (absent locally, where it reads "dev" instead).
 *
 * Server-only, like the rest of `src/lib/**`: the bundler does not tree-shake
 * the `package.json` import, so importing this from a Client Component would
 * ship the whole file — dependencies, scripts and all — to the browser.
 */
const version = pkg.version;

const sha = process.env.VERCEL_GIT_COMMIT_SHA;
const commit = sha ? sha.slice(0, 7) : "dev";

export const APP_VERSION_LABEL = `v${version} · ${commit}`;
