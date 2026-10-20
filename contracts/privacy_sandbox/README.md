# Offline contract validation

These manually authored reference contracts cover the dummy-credit authority and local subscription helpers. They are not a generated Constrain interview, a production payment protocol, or a claim that PACT proved anonymity.

Run from the repository root with the installed Constrain and PACT tools available:

```sh
python3.14 contracts/privacy_sandbox/verify.py
node --test tests/sandbox*.test.js
```

The first command stages one sandbox component in a temporary directory, leaving the historical root PACT decomposition and provider configuration untouched. It invokes the **actual installed CLIs**:

- `constrain validate`
- `constrain boundary verify .constrain/artifacts/boundary_register.yaml --root .`
- `pact validate .`
- `pact boundary verify .`

Constrain checks artifact consistency and exact identifiers against SHA-256-pinned source lines. PACT checks contract completeness, type references, decomposition/test metadata and the same boundary evidence. Node syntax checks run before those gates. The runner then changes a source snapshot to ensure both tools reject stale evidence, and introduces an undefined return type to ensure PACT rejects it. These negative controls alter only temporary copies.

Behavioral acceptance is the separate Node suite: issuer/owner/domain checks, 47-versus-50 conservation, split/merge, replay and idempotency, failure atomicity, expiry, a seeded adversarial simulation, the two-independent-authorities double-spend counterexample, publisher scope, symmetric key rotation, UTC month-boundary negotiation, pending-versus-settled promises, superlike fallback, campaign proof/budget binding and verified-funds subscription release.

The 29 boundary records and 26 function contracts intentionally cover this reference sandbox only. Contract test metadata describes the executable tests but does not replace them. The contract tools' structural checks do not execute those tests, prove cryptographic security, eliminate Sybil attacks, establish human attention, certify money handling or create unlinkable transactions.

Source hashes are deliberately pinned. After reviewing a change to a cited file, run `python3.14 contracts/privacy_sandbox/capture_evidence.py --reviewed-source-change` to re-capture token lines and hashes with Constrain's installed boundary implementation and update the embedded PACT records and authored Constrain session together. Never change a hash merely to make a failing gate green. The session under `.constrain/sessions` contains only these public-ready authored artifacts and no chat history.
