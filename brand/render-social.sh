#!/usr/bin/env bash
# Renders ./ios/src and ./social/src SVGs to PNG at their native size. Needs Python 3 and Chrome or Edge.
SK="${LOGO_SKILL_SCRIPTS:-$HOME/.claude/plugins/cache/logo-design-skill/logo-design/1.4.5/skills/logo-design/scripts}"
for d in ios social; do for f in $d/src/*.svg; do
 w=$(grep -o ' width="[0-9]*"' "$f" | head -1 | grep -o '[0-9]*'); h=$(grep -o ' height="[0-9]*"' "$f" | head -1 | grep -o '[0-9]*')
 py -3 "$SK/render_png.py" "$f" -o "$d/$(basename "${f%.svg}").png" --width "$w" --height "$h" >/dev/null || echo "FAILED $f"
done; done; echo rendered
