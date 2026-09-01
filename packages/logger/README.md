# Structured logger

Provides one logger for the API and workers. Development uses Nest's readable,
colorized console format; test and production use structured JSON with service,
level, ISO timestamp, context, and event fields.

Known credential fields are redacted before output. Callers must still avoid
placing secrets, tokens, private answers, or raw payloads inside log messages.

An observability transport remains intentionally deferred; production can ship
the JSON stream without changing application logging calls.
