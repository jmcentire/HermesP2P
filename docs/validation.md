# Validation scope and evidence

This revision was checked with executable Node tests, the installed Constrain and PACT mechanical validators, and actual local-model Advocate and Simulacrum reviews. These checks establish properties of the reference sandbox and the tested transport paths. They do not certify production anonymity, human attention, durable money handling, or safe distributed settlement.

## Reproduce the checks

From the repository root:

```sh
npm test
python -m pytest tests/test_relay.py
python3.14 contracts/privacy_sandbox/verify.py
```

The contract runner uses the installed **Constrain 0.5.0** and **PACT (`pact-agents`) 0.14.1** CLIs. It stages only the sandbox component in a temporary directory and does not start the historical provider-backed PACT pipeline. Its actual invocations are:

```sh
constrain validate
constrain boundary verify .constrain/artifacts/boundary_register.yaml --root .
pact validate .
pact boundary verify .
```

Constrain validates the manually authored artifacts and checks exact boundary identifiers against SHA-256-pinned source lines. PACT checks contract completeness, type references, decomposition/test metadata and the same source evidence. The runner also checks JavaScript syntax and verifies that test metadata references existing executable tests and declared contract functions. Node tests remain a separate behavioral gate.

The runner then deliberately modifies a temporary cited source and confirms that both Constrain and PACT reject the stale hash. A third negative control introduces an undefined PACT return type and confirms rejection. These changes affect temporary copies only.

The `.constrain` session is an import of authored public-ready artifacts, not a claim that a Constrain interview or LLM synthesis occurred. Source hashes must be recaptured only after reviewing the corresponding source changes; see [the sandbox contract instructions](../contracts/privacy_sandbox/README.md).

The final sandbox run passed **32 tests with zero failures**. Its contract run passed **26 function contracts, 29 boundary entries, 32 executable-test descriptions and all three negative controls**. These counts refer to the sandbox scope, not the complete transport suite.

## Named reviewer invocations

**Advocate 0.1.5** ran its actual `red_team` persona, using the existing local `gemma3:27b-it-q4_K_M` model through Ollama's OpenAI-compatible endpoint. **PACT's bundled Simulacrum** ran its actual specialist engine using the same local model through Ollama's Anthropic-compatible endpoint. No internal agent role was substituted for either tool. No external paid provider was called. The commands below show the routing; `review-packet.txt` is a review input containing the relevant public sandbox code and protocol contract.

```sh
OPENAI_BASE_URL=http://127.0.0.1:11434/v1 \
OPENAI_API_KEY=local-ollama-placeholder \
advocate review review-packet.txt --provider openai \
  --model gemma3:27b-it-q4_K_M --persona red_team \
  --sequential --no-color --output advocate-review.json

ANTHROPIC_BASE_URL=http://127.0.0.1:11434 \
ANTHROPIC_API_KEY=local-ollama-placeholder \
SIMULACRUM_CLASSIFIER_MODEL=gemma3:27b-it-q4_K_M \
SIMULACRUM_SPECIALIST_MODEL=gemma3:27b-it-q4_K_M \
GENERALIST_MODEL= OPENAI_API_KEY= \
python3.14 -m pact.vendor.simulacrum < review-packet.txt
```

The placeholder keys above are nonsecret local compatibility values. These commands assume the named model is already installed and running locally; they do not install or download it.

The initial Advocate report alleged unchecked sums and operation-ID reuse; those particular claims were contradicted by the reviewed code. Claude Validator subsequently identified concrete **cross-signer operation-ID squatting and clock-rollback defects**. Those were substantive fixes: requests now use currency/action/signer/id namespaces, and both authority and application settlement paths enforce monotonic trusted time.

Both actual local reviewers were then rerun against the clarified economics: pending promises are not settled funds; failed optional superlikes reduce to ordinary likes; advertising proofs bind campaign, action, recipient and budget; and subscription tokens require verified settled ordinary credits. The full packet included all four sandbox modules and the public protocol document. A final supplemental pass reviewed the application clock guard added immediately after the first snapshot. [The final reviewed-source manifest](../contracts/privacy_sandbox/reviewed_sources.json) pins the exact sandbox source bytes covered by the combined passes. Its documentation entries separately record two later disclosure-only edits requested by Claude: product registration is trusted local setup, and the campaign boundary holds only through the advertiser-operated adapter.

The refreshed Advocate reports alleged an unbounded recipient set, budget overflow and a subscription capacity race. Code inspection showed that each inserted recipient requires one of at most 1,024 stored proofs, every budget sum is checked as a safe integer, and the capacity-check/redemption/update path has no asynchronous yield. Seven targeted regression tests passed. An additional runtime counterexample paid a campaign `Number.MAX_SAFE_INTEGER` units, returned the funds to its advertiser, and attempted one further unit: it rejected before monetary mutation. Time-source trust and multiple-instance behavior remain explicit limitations, rather than guarantees supplied by these checks.

Both refreshed Simulacrum passes reported no new actionable defect within the documented single-process, trusted-authority model. That is a local model's assessment, not a proof. No review establishes production durability, anonymity, human attention, real creator payouts or secure key delivery. The adapters return only dummy model outcomes; actual financial and authenticated delivery integrations remain absent.

## Remaining security limits

The dummy-credit authority is synchronous, trusted and in memory. It cannot promise crash recovery, durable idempotency, cross-replica finality or anonymous transfers. Public signing keys and provenance are linkable. Separately signed advertising credits prevent domain mixing in this sandbox, but recipient-supplied evidence does not establish viewing, humanity or attention; bots and collusion remain unresolved.

Publisher authentication and monthly encryption have distinct jobs. Group key holders can author symmetric envelopes; accepting a publisher-only message must additionally verify the configured publisher's signature and the complete inner/outer channel, month and message scope. Rotation does not erase previously disclosed keys or ciphertext. Payment negotiation, secure key delivery, recovery and revocation require further design.

## Transport and browser evidence

The complete local automated run passed **206 Vitest tests across six files**, **32 Node sandbox tests**, and **11 Python relay tests**. The transport tests mix focused mocks with real NaCl cryptography; mocks do not establish browser interoperability. Three temporary mutation controls removed sealed-message proof binding, signature verification, and credit conservation in turn. Each caused the corresponding behavioral test to fail. Original source was not mutated.

Two Chrome clients against the local Gunicorn relay exchanged public text, authenticated encrypted direct messages, and encrypted channel messages using different local channel names with the same key. The final scoped-signing version also delivered the shared-key channel message once. Configuration survived reload. These checks used generated test identities and no live funds.

Direct WebRTC did **not** connect in that local browser run. Offer, answer and ICE signalling reached both clients, but the 15-second negotiation timeout fired; relay delivery remained available. Host-candidate-only connectivity, cross-browser and WAN mesh delivery remain unverified. Aggregate timeout diagnostics are best effort and do not establish a root cause. No browser security policy, public STUN service or paid relay was introduced to bypass the result.

The Flask and static Pages website variants were checked at desktop and 390-pixel mobile widths; the existing logo assets are unchanged. The feature branch does not deploy either the Pages main-branch site or the relay.

The hub admits a new connection at capacity by replacing the connection least recently sending a new application frame. Closing happens outside the shared registry lock; evicted handlers cannot relay queued frames. Silent readers can therefore be evicted, and active Sybil churn remains an availability threat. This policy removes indefinite occupation by idle sockets without claiming identity-based fairness.


### Direct-connectivity isolation

A minimal native WebRTC loopback, with no HP2P or hub code, reproduced the failure using both trickled candidates and complete SDP exchanged after gathering. At two and eight seconds before cleanup, both peers had stable signalling, completed gathering, usable application SDP and SCTP, but ICE stayed `new`, with zero remote candidates or candidate pairs. The real-hub mesh probe showed the same pre-close result. This rules out HP2P signalling as a necessary cause of this particular failure; it does not prove the mesh works on another network.

The tested Chrome instance emitted host UDP candidates using mDNS and reported the browser local-network permission as `prompt`. Initially, macOS showed Chrome Local Network access off. The owner subsequently approved enabling it for the test Chrome application. The selected entry was verified against the running application's path before one switch was changed; macOS mirrored that app-scoped change across its duplicate Chrome rows. Other applications and network settings were not changed.

The approved rerun **did not resolve connectivity**. Both native loopbacks still had stable signalling, complete gathering, valid application SDP/SCTP, four local candidates, zero remote candidates and zero pairs at two/eight seconds. The actual HP2P mesh exchanged and applied offers, answers and ICE, but its two/eight/twelve-second snapshots remained the same; direct sends were zero and negotiation timed out. All three runs cleaned up normally. The browser permission query remained `prompt`, which is distinct from the enabled macOS application permission.

The permission restriction is therefore not a demonstrated sole cause. No recoverable HP2P signalling defect was established by these checks. A fresh browser process or a separate test device is the next isolation step; the active user's browser was not restarted. No firewall rules, browser flags, router settings, media permissions or external ICE services were changed. Direct P2P and WAN connectivity remain unverified; successful hub delivery must not be represented as direct delivery.

Claude Validator reviewed successive source snapshots through a dedicated CLI session on the existing subscription. Its final transport review found the two availability defects fixed, and its final economics review found no critical or high defect within the explicit trusted, single-process sandbox boundary. It requested the two trust-boundary disclosures above. Claude inspected source; the executable checks reported here were run separately. Its follow-up review of the permission rerun found no justified application-code correction from the observed native and HP2P failures; the root cause remains unresolved.
