Place TLS certificates here when enabling HTTPS in nginx.

Expected filenames:
- `fullchain.pem`
- `privkey.pem`

This directory is mounted to `/etc/nginx/ssl` inside the nginx container.
