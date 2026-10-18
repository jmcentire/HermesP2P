# Review boundaries

- Keep transient transport separate from `sandbox/`; never wire reference credits into HTTP, browser code, wallets, or payment providers.
- Bind routing, expiry and replay metadata cryptographically. For sealed payloads, bind the outer proof key inside the authenticated plaintext; test an attacker who re-signs rather than merely corrupts bytes.
- Require correct sender/recipient/channel scope before display. Never fall back to plaintext or a real identity on cryptographic failure.
- Public pseudonyms prove control of a scoped key, not human identity. No anonymity, forward-secrecy, delivery, retention or attention claims without evidence.
- Preserve ordinary/advertising signature domains, supply conservation, expiry, provenance, failure atomicity and scoped idempotency. Use dummy credits only.
- Keep buffers, peer lists, replay maps and signalling bounded. Capacity pressure must not permanently black out the whole client.
- Run `npm test` and `python -m pytest tests/test_relay.py`. Review sandbox source before refreshing Constrain/PACT evidence; run their offline verifier where installed.
- Test real browser interoperability separately from mocked transport. Do not call a timed-out ICE path connected.
- Never commit private source history, local credentials, generated review logs or unrelated working changes. Preserve the existing logo.

Review handwritten source and tests. Skip vendored minified libraries and lockfile internals, while checking their origin/version/license and integrity. Publishing static Pages and deploying the relay are separate operations.
