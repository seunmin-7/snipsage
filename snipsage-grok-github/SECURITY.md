# Security

Never commit `server/.env` or any API key. If a key is accidentally exposed, revoke it immediately in the provider console and create a new one.

This prototype has no authentication or rate limiting. Do not expose the backend directly to the public internet until those controls are added.
