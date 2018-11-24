const preprocessor = require('../preprocess_helpers.js');

module.exports = {
  resolution: [640, 480],
  source: preprocessor.preprocess('mains/monte_carlo.glsl', {
    renderer: { file: 'renderer/bidirectional_tracer_1_light_vertex.glsl' },
    scene: { file: 'scene/test.glsl' },
    camera: { file: 'camera/pinhole.glsl' },
    rand: { file: 'rand/fixed_vecs.glsl' },
    parameters: { source: `
      #define N_BOUNCES 4

      //#define N_BOUNCES 1
      //#define WEIGHTING_HEURISTIC HEURISTIC_DIRECT_ONLY
    `}
  }),
  "monte_carlo": true,
  "refresh_every": 20,
  "uniforms": {
      "resolution": "resolution",
      "base_image": "previous_frame",
      "frame_number": "frame_number",
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
      "random_uniforms_8": "random_uniform_4"
  }
};
