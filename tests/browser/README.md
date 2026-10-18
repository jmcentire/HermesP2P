# Local browser connectivity fixture

This manual test separates browser ICE connectivity from HP2P signalling. It uses
dummy text, no STUN/TURN servers, no media capture, and no permission requests or
security-setting changes. Only the mesh test contacts `ws://localhost:8787/ws`.
`tests/` is excluded from the production Docker image.

From the repository root, using the project's existing Python environment:

```sh
# Terminal 1: local hub, one worker because the registry is process-local.
.venv/bin/python -m gunicorn --bind 127.0.0.1:8787 --workers 1 --threads 16 --timeout 0 main:app
```

```sh
# Terminal 2: serve the fixture and its relative module import, locally only.
.venv/bin/python -m http.server 8788 --bind 127.0.0.1
```

Open `http://localhost:8788/tests/browser/connectivity.html`. Run each button once:

1. **Native trickle loopback:** two browser peer connections exchange descriptions
   and candidates directly, without MeshTransport or the hub.
2. **Native complete-SDP loopback:** waits for gathering before exchanging the
   final descriptions, excluding trickle-delivery timing as a cause.
3. **Mesh through local hub:** two MeshTransport clients use the real WebSocket
   signalling relay. Dummy frames are sent only through direct data channels, so
   a received marker cannot be mistaken for relay delivery.

Only one run is allowed at a time. Stop, page navigation, errors, and the absolute
22-second deadline clean up sockets, peer connections, listeners, and timers.
Gathering waits are bounded at five seconds and stats waits at one second. Stop
both local servers with Ctrl-C when finished. Do not expose the fixture server
outside localhost; it serves repository files.

Success requires a channel-open event and a dummy-frame-received marker. Record
the browser/OS version, test mode, result, and the safe pre-close snapshots at
two/eight seconds (mesh also at twelve seconds). Counts and states alone do not
prove application delivery. The fixture prints only fixed status vocabularies,
capped counts, candidate class/protocol, and SDP-presence booleans; no candidate
strings, raw addresses, SDP, keys, routing IDs, or error messages are printed.
Do not collect or publish raw browser networking exports.

## Observed blocker on the development Mac

On 2026-10-18, native trickle and complete-SDP loopbacks both reached stable
signalling and complete ICE gathering but stayed in ICE `new`, with no remote
candidates or candidate pairs in pre-close snapshots. The real-hub mesh also
timed out. A read-only inspection found the listed Google Chrome entries disabled
under macOS Privacy & Security → Local Network. No permissions were changed.

This isolates the reproduced failure below HP2P signalling and identifies a
plausible OS restriction; it does not establish causation. A rerun after a
separately authorized permission change is needed to test that hypothesis. The
fixture never changes permissions, replaces mDNS candidates with addresses, or
adds external ICE services to force a connection.
