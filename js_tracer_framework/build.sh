#!/bin/bash
set -eux
python js_tracer_framework/folder_tree_to_js_requires.py --pattern '*.glsl' js_tracer_framework/ > js_tracer_framework/tracer_data.js
