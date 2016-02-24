# glsl-bench

A simple Python framework for running GLSL demos and Monte Carlo image generation,
e.g., raytracers. Similar to [Shadertoy](https://www.shadertoy.com/) in basic
functionality but runs locally.

**Usage**

    python glsl-bench.py examples/example.json

**Features**

 * Binding variables such as `mouse`, `time` and `previous_frame` to GLSL uniforms using a JSON configuration file.
 * Specifying textures in configuration files
 * Image output in raw float (`.npy`) and PNG formats
 * Compile time templating with [Mustache](https://mustache.github.io/)

**Dependencies**: `pygame`, `scipy`, `pystache` (if using templates)
