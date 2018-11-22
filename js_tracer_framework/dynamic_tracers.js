"use strict";

function preprocessFile(mainFile, includeMapping, files) {
  // this might break down if utilizing heavy preprocessor magic near
  // the #include directive
  function getIncludeTarget(line) {
    line = line.trim('');
    // try to handle commented includes... not bulletproof
    if (line.startsWith('//') || line.startsWith('/*')) return null;

    const pattern = /^#include\s*["<]([^">]+)/;
    const match = pattern.exec(line);
    return match && match[1];
  }

  function isString(str) {
    // https://stackoverflow.com/a/17772086/1426569
    return Object.prototype.toString.call(str) === "[object String]";
  }

  function getFile(fn) {
    if (!fn || fn === '') {
      throw new Error('no file name given');
    }
    const parts = fn.split('/');
    let data = files;
    while (parts.length > 0 && data) {
      data = data[parts.shift()];
    }
    if (!isString(data)) {
      throw new Error(`'${fn}' file not found`);
    }
    return data;
  }

  const included = {};

  function resolveTarget(target) {
    return includeMapping[target] || target;
  }

  function preprocess(source) {
    const result = [];
    source.split('\n').forEach(line => {
      // find include directive
      const includeTarget = getIncludeTarget(line);
      if (includeTarget) {
        if (!included[includeTarget]) {
          included[includeTarget] = true;
          const resolved = resolveTarget(includeTarget);
          if (!resolved)
            throw new Error(`#include <${includeTarget}> not specified`);
          result.push(doPreprocess(resolved));
        }
      }
      else if (line) {
        result.push(line);
      }
    });
    return result.join('\n');
  }

  function doPreprocess(fileName) {
    return preprocess(getFile(fileName));
  }

  return doPreprocess(mainFile);
}

const dynamicTracers = {
  test: {
    "resolution": [640, 480],
    "source": preprocessFile('mains/monte_carlo.glsl', {
      'renderer': 'renderer/pathtracer.glsl',
      'scene': 'scene/test.glsl',
      'camera': 'camera/pinhole.glsl',
      'rand': 'rand/fixed_vecs.glsl'
    }, Object.assign({
      'parameters': [
        '#define N_BOUNCES 4'
      ].join('\n')
    }, TRACER_DATA)),
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
