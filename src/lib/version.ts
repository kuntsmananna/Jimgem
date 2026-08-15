import pkg from "../../package.json";

/**
 * Which version of the app you are looking at.
 *
 * `package.json` is the single source of truth, and it is bumped with every
 * change that ships — patch for a fix or a tweak, minor for a new capability
 * or a visible redesign. **It stays below 1.0.0 until the owner says
 * otherwise**: 1.0 means the team has stopped using the Google Sheet and
 * runs on this, which is a call about the business, not about the code.
 *
 * The build's commit hash used to be appended here. It was dropped — it
 * answered "which build" for whoever was deploying, and the version answers
 * "which app" for everyone, which is the question actually being asked.
 *
 * Server-only, like the rest of `src/lib/**`: the bundler does not tree-shake
 * the `package.json` import, so importing this from a Client Component would
 * ship the whole file — dependencies, scripts and all — to the browser.
 */
export const APP_VERSION_LABEL = `v${pkg.version}`;
