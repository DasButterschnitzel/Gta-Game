# Keystores

`hafengold-test.jks` is a **test-only** signing key that is intentionally committed so that every
test APK built from this repository (locally or in CI) has the same signature and installs over
the previous version without uninstalling (keeping your save game).

* store password / key password: `hafengold-test`, alias: `test`
* **Never use this key for Google Play.** For the Play Store, create a private upload key
  (see `docs/PLAY_STORE.md`) and pass it via the `HG_KEYSTORE*` environment variables.
