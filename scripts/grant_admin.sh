#!/bin/bash
# Grant the coach/admin role to a user by username.
# Usage: ./scripts/grant_admin.sh <username>
# Requires the Clerk secret key at ~/.secrets/backspin-clerk-sk
set -euo pipefail
username="${1:?usage: grant_admin.sh <username>}"
sk=$(cat ~/.secrets/backspin-clerk-sk)
uid=$(curl -s -H "Authorization: Bearer $sk" "https://api.clerk.com/v1/users?username=$username" | python3 -c "import json,sys; u=json.load(sys.stdin); print(u[0]['id'] if u else '')")
[ -n "$uid" ] || { echo "no user named '$username'"; exit 1; }
curl -s -X PATCH "https://api.clerk.com/v1/users/$uid/metadata" \
  -H "Authorization: Bearer $sk" -H "Content-Type: application/json" \
  -d '{"public_metadata":{"role":"admin"}}' > /dev/null
echo "granted admin to @$username ($uid)"
