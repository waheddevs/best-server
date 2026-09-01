# Operational scripts

Reserved for safe, repeatable development and operational helpers. Scripts must
validate targets, fail loudly, and avoid destructive defaults.

The current local-infrastructure commands live in the root `package.json` so
they remain cross-platform. They validate and operate the reviewed Compose file
without removing persistent volumes.
