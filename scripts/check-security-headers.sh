#!/usr/bin/env bash
# Control de encabezados de seguridad (plans/plan-buenas-practicas-v0, 2.13.10). Se corre en el deploy y contra el
# build local. Sale con error si en <url-front>/login o <url-back>/api/health falta alguno de los encabezados, si
# aparece X-Powered-By, o si el HTML de /login no trae data-dpl-id (identificador del deploy).
#   bash scripts/check-security-headers.sh <url-front> [<url-back>]
set -u
FRONT="${1:?Uso: check-security-headers.sh <url-front> [<url-back>]}"
BACK="${2:-}"
FAIL=0

check_headers() {
  local url="$1"; shift
  local headers
  headers="$(curl -sS -o /dev/null -D - --max-time 20 "$url" | tr -d '\r')" || { echo "FALLA: no contesta $url"; FAIL=1; return; }
  for h in "$@"; do
    if ! grep -qi "^$h:" <<<"$headers"; then echo "FALLA: $url sin $h"; FAIL=1; fi
  done
  if grep -qi '^x-powered-by:' <<<"$headers"; then echo "FALLA: $url manda X-Powered-By"; FAIL=1; fi
  if ! grep -i '^content-security-policy:' <<<"$headers" | grep -q "frame-ancestors 'none'"; then
    echo "FALLA: $url sin frame-ancestors 'none' en la CSP"; FAIL=1
  fi
}

COMMON=(content-security-policy strict-transport-security x-content-type-options x-frame-options referrer-policy)
check_headers "${FRONT%/}/login" "${COMMON[@]}" permissions-policy
if ! curl -sS --max-time 20 "${FRONT%/}/login" | grep -q 'data-dpl-id='; then
  echo "FALLA: ${FRONT%/}/login sin data-dpl-id (¿build sin DEPLOYMENT_ID?)"; FAIL=1
fi
if [ -n "$BACK" ]; then
  check_headers "${BACK%/}/api/health" "${COMMON[@]}"
fi

if [ "$FAIL" -eq 0 ]; then echo "OK: encabezados de seguridad"; fi
exit "$FAIL"
