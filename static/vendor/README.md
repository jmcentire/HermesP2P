# Browser dependencies

These existing browser dependencies are served locally so the client does not load third-party JavaScript at runtime. Their licenses are adjacent. Vendoring is not a security audit; update versions deliberately and rerun the browser tests.

| File | Source/version | SHA-256 |
| --- | --- | --- |
| `nacl-fast.min.js` | tweetnacl 1.0.3 (existing npm dependency) | `3ec535c004aeeb225785d8e93fb33bf99f52e399bd7dfc01969b5629baea5131` |
| `base64js.min.js` | base64-js 1.5.1 (existing npm dependency) | `d2e82495607abf54f16e21de04d90ba9ce1605451667d88425babece988f148b` |
| `bootstrap.bundle.min.js` | Bootstrap 5.1.3 (formerly loaded from jsDelivr) | `f5210fa3e7f0245a4c51eb7f280092c0ef99fdd28c45e17dab8cc5854fdf4fd3` |
| `feather.min.js` | feather-icons 4.29.2 (pinned former CDN dependency) | `ea465ac6b69a037dc49fda6ab1c585f95725091eff4515df61db91d9d3c5e54e` |
