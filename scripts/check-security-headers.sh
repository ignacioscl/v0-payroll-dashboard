#!/usr/bin/env bash
# Control de encabezados de seguridad (plans/plan-buenas-practicas-v0, 2.13.10). Se corre en el deploy y contra el
# build local. Sale con error si en <url-front>/login o <url-back>/api/health falta alguno de los encabezados, si
# aparece X-Powered-By, o si el HTML de /login no trae data-dpl-id (identificador del deploy).
#   bash scripts/check-security-headers.sh <url-front> [<url-back>]
#
# Va con un User-Agent de navegador: el Apache de PROD (mod_security) contesta 406 al de curl, y sin esto el script
# leía la página de error y decía que faltaban todos los encabezados (16/11/2026). Una respuesta que no es 200 se
# informa como tal, no como encabezados faltantes.
set -u
FRONT="${1:?Uso: check-security-headers.sh <url-front> [<url-back>]}"
BACK="${2:-}"
FAIL=0
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

fetch_headers() {
  curl -sS -o /dev/null -D - --max-time 20 -A "$UA" "$1" | tr -d '\r'
}

check_headers() {
  local url="$1"; shift
  local headers status
  headers="$(fetch_headers "$url")" || { echo "FALLA: no contesta $url"; FAIL=1; return 1; }
  status="$(head -n 1 <<<"$headers" | awk '{print $2}')"
  if [ "$status" != "200" ]; then echo "FALLA: $url contesta $status (no se pueden mirar los encabezados)"; FAIL=1; return 1; fi
  for h in "$@"; do
    if ! grep -qi "^$h:" <<<"$headers"; then echo "FALLA: $url sin $h"; FAIL=1; fi
  done
  if grep -qi '^x-powered-by:' <<<"$headers"; then echo "FALLA: $url manda X-Powered-By"; FAIL=1; fi
  if ! grep -i '^content-security-policy:' <<<"$headers" | grep -q "frame-ancestors 'none'"; then
    echo "FALLA: $url sin frame-ancestors 'none' en la CSP"; FAIL=1
  fi
  return 0
}

COMMON=(content-security-policy strict-transport-security x-content-type-options x-frame-options referrer-policy)
if check_headers "${FRONT%/}/login" "${COMMON[@]}" permissions-policy; then
  # form-action tiene que llevar los orígenes del legacy (el logout y «Back to legacy» redirigen ahí).
  if ! fetch_headers "${FRONT%/}/login" | grep -i '^content-security-policy:' | grep -qE "form-action 'self' https?://"; then
    echo "FALLA: ${FRONT%/}/login sin el legacy en form-action (¿build sin SRS_LEGACY_ORIGINS?)"; FAIL=1
  fi
  if ! curl -sS --max-time 20 -A "$UA" "${FRONT%/}/login" | grep -q 'data-dpl-id='; then
    echo "FALLA: ${FRONT%/}/login sin data-dpl-id (¿build sin DEPLOYMENT_ID?)"; FAIL=1
  fi
fi
if [ -n "$BACK" ]; then
  check_headers "${BACK%/}/api/health" "${COMMON[@]}"
fi

if [ "$FAIL" -eq 0 ]; then echo "OK: encabezados de seguridad"; fi
exit "$FAIL"
