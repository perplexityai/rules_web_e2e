#!/bin/bash
set -euo pipefail
exec node -e 'process.stdout.write("caller executable reached")'
