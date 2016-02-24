# glsl-bench

A simple Python framework for running GLSL demos and Monte Carlo image generation,
e.g., raytracers. Similar to [Shadertoy](https://www.shadertoy.com/) in basic
functionality but runs locally.

**Usage**

    python glsl-bench.py examples/example.json

**Features**

 * Binding variables such as `mouse`, `resolution`, `time` and `previous_frame` to GLSL uniforms using a JSON configuration file.
 * Image output in raw float (`.npy`) and PNG formats

**Dependencies**: `pygame`, `scipy`, `pystache` (if using templates)
