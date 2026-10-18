# HP2P privacy sandbox

Manually authored contract artifacts from authorized HP2P requirements. These are inputs to Constrain's offline validation; no interview, LLM synthesis or independent review is claimed.

## Trust and Authority Model

A single trusted dummy-credit authority owns issuance totals, unspent provenance, accepted operation fingerprints and redemptions. Issuer keys authorize issuance; holder signatures authorize spending; advertising-recipient signatures bind claims. Signatures do not prove attention, unique humans or unlinkability. Multiple isolated authorities cannot safely finalize the same input without shared accounting. No production financial backend is connected.

## Component Topology

The sandbox depends on Node's built-in cryptography. Credits and subscriptions use the sandbox signature helpers. Stateless transport is separate from monetary accounting. Publisher signatures authenticate one publisher; symmetric group keys allow any key holder to author messages. Monthly key rotation and the negotiation-window helper do not implement billing or key distribution.

## Acceptance evidence

The PACT contract and Node tests exercise dummy-credit conservation, invalid provenance, replay, failure atomicity, expiry, domain separation, subscription authentication and monthly boundaries. Boundary records pin exact identifiers to implementation and requirement/test sources. Passing structural validation is not a proof of production security or anonymous payments.

## Composed publisher subscriptions

The publisher-only encrypted channel composes a scoped publisher signature inside the current monthly symmetric envelope. Opening verifies both mechanisms and matches the inner and outer channel, month and message id. It does not reject an unchanged replay or enforce payment-based key delivery. The refreshed named-review packet includes this composition alongside the clarified economic adapters. Mechanical contract checks and executable tests remain distinct acceptance evidence.

## Clarified economics

A signed promise is pending until a settlement authority accepts it. Optional unexpected superlikes that lack verified settlement reduce to ordinary likes, without spendable balance or paid entitlement. Advertising is a closed designated-credit campaign budget with collected proofs bound to campaign, action and recipient; those proofs do not establish human attention. Monthly subscription access requires verified settled funds for the corresponding recipient, channel and epoch. These semantics are exercised only with dummy credits and explicit in-memory authority state.
