# TLS Certificates

Place your TLS certificate files here:

- `fullchain.pem` — Full certificate chain
- `privkey.pem` — Private key
- `.htpasswd` — Basic auth file for n8n editor

## Quick self-signed cert (for local testing only):

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout privkey.pem -out fullchain.pem -subj "/CN=localhost"
```

## Basic auth file:

```bash
htpasswd -cb .htpasswd admin 'a-strong-password'
```
