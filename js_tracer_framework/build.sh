#!/bin/bash
set -eux
python js_tracer_framework/folder_tree_to_json.py --pattern '*.glsl' js_tracer_framework/ > build/tracers.json
echo "const TRACER_DATA = " > build/tracer_data.js
cat build/tracers.json >> build/tracer_data.js
echo ";" >> build/tracer_data.js
grep -v '"use strict";' js_tracer_framework/dynamic_tracers.js >> build/tracer_data.js
