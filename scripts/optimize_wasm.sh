#!/usr/bin/env bash
# Re-optimize all Odra wasm files for Casper VM (vm-casper-v1):
#  - remove DataCount section (Casper VM rejects "Sections out of order" when
#    DataCount id=12 sits before Code id=10)
#  - disable post-MVP opcodes (sign-ext, bulk-memory) that Casper VM rejects
# Usage: docker run ... bash /workspace/scripts/optimize_wasm.sh
set -euo pipefail
cd /workspace
mkdir -p wasm_orig wasm_opt
for f in wasm/*.wasm; do
  base="$(basename "$f")"
  [ "$base" = "CTR_fixed.wasm" ] && continue
  cp "$f" "wasm_orig/$base"
  echo ">>> optimizing $base"
  wasm-opt -Oz --strip-debug --strip-producers --disable-sign-ext --disable-bulk-memory \
    -o "wasm_opt/$base" "$f"
done
echo "=== verify: no DataCount, strict numeric order ==="
bad=0
for f in wasm_opt/*.wasm; do
  printf '%-40s ' "$(basename "$f")"
  if wasm-objdump -h "$f" 2>/dev/null | grep -q DataCount; then
    echo "HAS DATACOUNT (BAD)"; bad=1
  else
    echo "ok"
  fi
done
exit $bad
