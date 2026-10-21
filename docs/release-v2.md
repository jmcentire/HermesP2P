# Protocol v2 application release

The landing page and text client ship with the relay as one image. GitHub Pages
publishes the separate `docs/` landing page from `main`; a source push does not
deploy the Fly application. Both landing pages retain the existing logo.

## Upgrade boundary and identity

The relay requires the `hp2p.v2` WebSocket subprotocol before admitting a peer.
Old clients receive an upgrade notice and close code 1008; they never enter the
v2 roster or relay. Existing v1 tabs cannot understand the new message envelopes.
Their old UI may continue trying to reconnect rather than display this notice.
Download their identity backup, then reopen `/client` and restore it locally.
Reloading in the same tab preserves its `hp2pConfig` session storage. Closing
the tab can lose an identity without a backup. Never clear browser storage as
part of this upgrade. Identity files contain unencrypted secret keys.

The new client can download a backup without leaving. The landing page's restore
link opens the identity menu. Valid legacy identity keys, contacts, shared room
keys and aliases retain their values; import checks key consistency before
replacing the current tab's identity. No import is sent to the server. Messages
are not persisted or migrated, and delivery during the restart is not guaranteed.

## Deployment procedure

1. Run `npm test`, relay tests and the source-pinned browser-controller checks.
2. Build the pinned Dockerfile locally for `linux/amd64`, with `HP2P_RELEASE` set
   to the source commit. It copies only the HTTP/relay application and public
   assets, excluding financial sandbox code, test fixtures and private history.
3. Run that image on `127.0.0.1:18787`, then run
   `python tests/check_release_runtime.py`. Check the real client with dummy
   identities: relay delivery, offline draft retention, reconnect and mobile UI.
4. Record the existing image digest and machine before changing anything. Push
   the tested image to the existing `registry.fly.io/hp2p` repository. Deploy its
   immutable digest to the existing machine with `--ha=false --update-only`.
   Use a single-machine immediate replacement: never serve mixed client/relay
   versions during a rolling multi-instance upgrade. A short outage is expected.
5. Verify `/healthz` returns the source commit and protocol 2, `/client` and
   static assets match the tested build, CSP is present, and a real TLS WebSocket
   handshake negotiates `hp2p.v2`. Verify Pages separately after its build.

## Rollback

Before this release, Fly app `hp2p` used machine `e148e6e27f2389` in `ord` and image
`registry.fly.io/hp2p@sha256:2a2a88678dae01942bbc05c14b105975df1d47b0c7a2f2d4ec6535f6c55c8166`.
If health, static assets or WebSocket negotiation fail, update the same machine
back to the recorded digest; do not create additional capacity. Roll back the
whole application image, not JavaScript or relay alone. Clients must reload
after rollback, preserving or restoring their identity. This emergency fallback
restores the old protocol and its old security limitations, not v2 compatibility.
Pages can be reverted by a normal source commit; never force-push history.

## Scope and limits

WebSocket relay delivery remains active alongside experimental direct links.
The local Chrome direct-connectivity limitation is unresolved; cross-device/WAN
mesh delivery is not established. There is no STUN/TURN service, offline inbox,
forward secrecy guarantee or demonstrated anonymous network. Public rooms are
public; relays can observe network metadata. New clients preserve unsent drafts
while disconnected and distinguish handing a message to the network from proof
that its recipient received it. Images, video, publisher subscriptions, rewards,
payments and settlement remain future work. Dummy-credit tests are not deployed
as a financial backend.
