# Package Installation Log

This log records all dependencies used across all phases of the Athena Exam Desktop Application foundation.

## Runtime Dependencies (`dependencies`)

| Package Name | Exact Installed Version | Type | Purpose | Installation Command |
| :--- | :--- | :--- | :--- | :--- |
| `react` | `^19.2.8` (`19.2.8`) | Runtime | React core library for declarative UI rendering | `npm install` (from preserved `package.json`) |
| `react-dom` | `^19.2.8` (`19.2.8`) | Runtime | React DOM renderer for mounting the tree to web document | `npm install` (from preserved `package.json`) |

## Development Dependencies (`devDependencies`)

| Package Name | Exact Installed Version | Type | Purpose | Installation Command |
| :--- | :--- | :--- | :--- | :--- |
| `electron` | `^41.7.1` (`41.7.1`) | Dev | Desktop runtime bundling Chromium and Node.js | `npm install` (from preserved `package.json`) |
| `vite` | `^8.3.0` (`8.3.0`) | Dev | Fast HMR dev server and bundler for modern web apps | `npm install` (from preserved `package.json`) |
| `@vitejs/plugin-react` | `^6.1.1` (`6.1.1`) | Dev | Vite plugin for React JSX compilation using fast parser | `npm install` (from preserved `package.json`) |
| `@eslint/js` | `^10.0.1` (`10.0.1`) | Dev | ESLint official JavaScript configuration | `npm install` (from preserved `package.json`) |
| `eslint` | `^10.10.0` (`10.10.0`) | Dev | Code linter for JavaScript and React patterns | `npm install` (from preserved `package.json`) |
| `eslint-plugin-react-hooks` | `^7.1.1` (`7.1.1`) | Dev | Linter plugin enforcing React hooks rules | `npm install` (from preserved `package.json`) |
| `eslint-plugin-react-refresh`| `^0.5.6` (`0.5.6`) | Dev | Linter plugin validating React fast refresh components | `npm install` (from preserved `package.json`) |
| `globals` | `^17.12.0` (`17.12.0`) | Dev | Global variable definitions for ESLint | `npm install` (from preserved `package.json`) |
| `@types/react` | `^19.2.18` (`19.2.18`) | Dev | TypeScript type definitions for React | `npm install` (from preserved `package.json`) |
| `@types/react-dom` | `^19.2.7` (`19.2.7`) | Dev | TypeScript type definitions for React DOM | `npm install` (from preserved `package.json`) |

## Day 4 Architectural Evaluation: Built-in Node.js Backend

On **Day 4**, the backend integration was implemented natively using standard Node.js runtime modules (`node:http`, `node:fs`, `node:path`, `node:url`):

- **Zero External Dependencies:** Built without external `express` or `cors` npm packages to eliminate dependency bloat, reduce supply chain vulnerabilities, and enable fully deterministic execution in isolated environments.
- **Data Persistence:** Lightweight, reliable JSON storage implemented in `backend/data/questions.json` and `backend/data/sessions.json`.
- **Runtime Scripts:** Added `"server": "node backend/server.js"` to `package.json` for independent execution.

## Day 5 Release Readiness & Packaging Audit

On **Day 5**, a comprehensive dependency and release audit was performed:

- **Zero Additional Dependencies:** Confirmed that no superfluous npm packages were added, keeping the dependency surface minimal, secure, and fully deterministic.
- **Node Test Runner:** Verified that all 62 tests execute using Node's native test runner (`node --test`), eliminating the need for bulky test frameworks like Jest or Vitest.
- **Production Asset Compilation:** Confirmed `npm run build` (`vite build`) successfully transforms all 19 modules into optimized static client assets in `dist/`.
- **Packaging Hardening:** Main process snapshot paths were audited and hardened to support packaged environments (falling back to `app.getPath("userData")` if the bundle directory is read-only). Dedicated installer packaging tooling (e.g. `electron-builder`) is deferred to production deployment to prevent development bloat.
