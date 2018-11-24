const fs = require('fs'); // should use browserify/brfs

module.exports = {
  test: {
    "resolution": [640, 480],
    "source": [
      `
      #define N_BOUNCES 4

      //#define N_BOUNCES 1
      //#define WEIGHTING_HEURISTIC HEURISTIC_DIRECT_ONLY
      `,
      fs.readFileSync(__dirname + '/util/math.glsl'),
      fs.readFileSync(__dirname + '/rand/fixed_vecs.glsl'),
      fs.readFileSync(__dirname + '/util/random_helpers.glsl'),
      fs.readFileSync(__dirname + '/surfaces/sphere.glsl'),
      fs.readFileSync(__dirname + '/surfaces/box_interior.glsl'),
      fs.readFileSync(__dirname + '/scene/test.glsl'),
      fs.readFileSync(__dirname + '/camera/pinhole.glsl'),
      fs.readFileSync(__dirname + '/renderer/bidirectional_tracer_1_light_vertex.glsl'),
      fs.readFileSync(__dirname + '/mains/monte_carlo.glsl')
    ].join("\n").split("\n").filter(x => !x.trim().startsWith('#include')).join("\n"),
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
