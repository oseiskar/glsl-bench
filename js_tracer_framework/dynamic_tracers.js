"use strict";


const dynamicTracers = {
  test: {
    "resolution": [640, 480],
    "source_path": "examples/bdtracer/shader.glsl",
    "monte_carlo": true,
    "refresh_every": 20,
    "uniforms": {
        "resolution": "resolution",
        "base_image": "previous_frame",
        "frame_number": "frame_number",
        "tent_filter": "random_uniform_2",
        "random_gauss_1": "random_normal_4",
        "random_gauss_2": "random_normal_4",
        "random_gauss_3": "random_normal_4",
        "random_gauss_4": "random_normal_4",
        "random_gauss_5": "random_normal_4",
        "random_gauss_6": "random_normal_4",
        "random_gauss_7": "random_normal_4",
        "random_gauss_8": "random_normal_4",
        "random_uniforms_1": "random_uniform_4",
        "random_uniforms_2": "random_uniform_4",
        "random_uniforms_3": "random_uniform_4",
        "random_uniforms_4": "random_uniform_4",
        "random_uniforms_5": "random_uniform_4",
        "random_uniforms_6": "random_uniform_4",
        "random_uniforms_7": "random_uniform_4",
        "random_uniforms_8": "random_uniform_4",
        "light_sample": "random_normal_3",
        "random_choice_sample": "random_uniform_1"
    }
  }

};
