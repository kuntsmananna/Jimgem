import pkg from "../../package.json";

/**
 * Build identity, shown in the Dashboard footer so a deployed build can be
 * tied back to an exact commit.
 *
 * `version` is the single source of truth in package.json — bump it there
 * when cutting a release. `commit` comes from Vercel's build-time system env
 * var (absent locally, where it reads "dev" instead).
 */
export const APP_VERSION: string = pkg.version;

const sha = process.env.VERCEL_GIT_COMMIT_SHA;
export const APP_COMMIT: string = sha ? sha.slice(0, 7) : "dev";

export const APP_VERSION_LABEL = `v${APP_VERSION} · ${APP_COMMIT}`;
