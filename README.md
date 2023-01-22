# glsl-bench

A simple Python and JavaScript (WebGL) framework for running GLSL demos and Monte Carlo image generation,
e.g., raytracers. Similar to [Shadertoy](https://www.shadertoy.com/) in basic
functionality but runs locally.

**Usage**

    python glsl_bench.py examples/basic/conf.json

or

    python3 -m http.server 8000 --bind 127.0.0.1
    # open: http://localhost:8000/?shader=examples/black-hole/black-hole.json

**Features**

 * Binding variables such as `mouse`, `time` and `previous_frame` to GLSL uniforms using a JSON configuration file.
 * Specifying textures in configuration files
 * Image output in raw float (`.npy`) and PNG formats

**Python dependencies**: Install as `pip install -r requirements.txt`

**JavaScript** version uses [TWGL](https://twgljs.org/), which included
in `js_libs/` (distributed under the MIT license)
