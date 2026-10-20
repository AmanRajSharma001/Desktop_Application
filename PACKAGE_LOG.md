# Package Installation Log — Day 1

This log records all dependencies used in the Athena Exam Desktop Application foundation on Day 1.

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

## Deferred Dependencies (Not Installed on Day 1)

As per Day 1 boundary rules, backend dependencies (`express`, `cors`, `prisma`, `postgresql`, etc.) from Repository 2 (`athena-exam`) are deferred until Day 2+ to prevent bloating today's desktop foundation.
