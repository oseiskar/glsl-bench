#!/bin/bash
set -eux
python js_tracer_framework/folder_tree_to_js_requires.py --pattern '*.glsl' js_tracer_framework/glsl/ > js_tracer_framework/glsl/index.js
