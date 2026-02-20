# Operating Procedures

## Tech Stack
- Language: JavaScript ES6 modules (import/export syntax, no CommonJS require/module.exports)
- Runtime: Browser (not Node.js for production code)
- Testing: vitest (`npx vitest run` to execute)
- Crypto: TweetNaCl.js (`window.nacl` global) + Web Crypto API (`crypto.subtle`) for HMAC-SHA256/HKDF

## Standards
- Named exports only, no default exports
- No classes unless managing stateful lifecycle (e.g., the KnownPeersCache is acceptable as a class)
- JSDoc comments on all public (exported) functions
- No TypeScript in production code (test files may use TypeScript)
- Early returns to reduce nesting; avoid `else` when possible
- Prefer positive conditionals

## Module Pattern
- New modules go in `static/js/` alongside existing modules
- Each module is a single `.js` file with related functions
- Import from sibling modules using relative paths: `import { fn } from './module.js'`
- Globals available in browser: `window.nacl`, `window.base64js`, `crypto.subtle`, `TextEncoder`, `TextDecoder`

## Crypto Safety
- NEVER log private keys, secret keys, or decrypted message content
- NEVER log full message payloads — only log message IDs and metadata
- Use `console.warn()` for security-relevant drops (bad signature, expired TTL)
- Use `console.error()` only for actual errors (malformed data, missing dependencies)

## Testing
- Test files: `tests/*.test.js` (create `tests/` directory in project root)
- Tests run in Node.js via vitest (NOT in browser)
- For browser globals (`window.nacl`, `window.base64js`, `crypto.subtle`):
  - Use vitest's `vi.stubGlobal()` or manual mocks
  - `crypto.subtle` is available natively in Node.js 18+ (no mock needed)
  - For `nacl`: import `tweetnacl` directly in tests (`import nacl from 'tweetnacl'`)
  - For `base64js`: import `base64-js` directly in tests (`import base64js from 'base64-js'`)
- Each exported function must have at least one test
- Test file naming: `tests/padding.test.js`, `tests/ttl.test.js`, `tests/pseudonyms.test.js`, `tests/discovery.test.js`, `tests/crypto.test.js`
- No external test services or network calls in tests

## Integration Rules
- Add function calls to existing modules — do NOT rewrite existing modules from scratch
- When modifying existing files, make minimal, targeted changes
- New imports should be added at the top of the file with existing imports
- Preserve existing function signatures — add new parameters as optional with defaults

## Message Flow Order
Send: compose -> encrypt -> stampTTL -> pseudonym (channels) -> package -> sign -> serialize -> pad -> broadcast
Receive: receive -> unpad -> deserialize -> TTL check -> dedup -> verify signature -> decrypt -> display

## Verification
- All functions must have at least one test
- Tests must be runnable with `npx vitest run` without external services
- No task is done until its contract tests pass
- Run `node -e "import('./static/js/MODULE.js')"` to verify module syntax (type=module)

## Preferences
- Prefer stdlib/Web APIs over third-party libraries
- Keep files under 300 lines
- Use `crypto.getRandomValues()` for random bytes (not Math.random() for crypto)
- Use `Date.now()` for timestamps, `date-fns` not required for this project
- Constants at top of file, exports at bottom or inline with `export function`
