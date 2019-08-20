
/* global twgl, document, setTimeout, requestAnimationFrame, cancelAnimationFrame, XMLHttpRequest */

/* eslint-disable prefer-destructuring, no-use-before-define */

// quite sphagetti but gets the job done
// eslint-disable-next-line no-unused-vars
function GLSLBench({ element, url, spec }) {
  let anyErrors = false;

  let errorCallback = (errorText) => {
    throw new Error(errorText);
  };

  function error(errorText) {
    anyErrors = true;
    errorCallback(errorText);
  }

  this.onError = (callback) => {
    errorCallback = callback;
  };

  let render;
  let shader;
  let frameBuffers;
  let frameNumber;
  let resolution;

  const mousePos = {
    x: 0, y: 0, rel_x: 0, rel_y: 0
  };

  if (!element) {
    return error('Missing attribute: (DOM) element');
  }

  // try to initialize WebGL
  const container = element;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');

  if (gl === null) {
    return error('Unable to initialize WebGL. Your browser or machine may not support it.');
  }

  // changed when the shader starts
  this.running = false;
  this.stop = () => {};

  this.destroy = () => {
    this.stop();
    if (canvas) canvas.parentNode.removeChild(canvas);
  };

  this.captureImage = (callback) => {
    if (!this.running && this.resume) {
      // if stopped, must render a new frame before capture
      this.captureCallback = (data) => {
        callback(data);
        this.stop();
      };
      this.resume();
    } else {
      this.captureCallback = callback;
    }
  };

  container.appendChild(canvas);

  const VERTEX_SHADER_SOURCE = `
  precision highp float;
  precision highp int;
  attribute vec3 position;

  varying vec3 pos;
  void main() {
      pos = position;
      gl_Position = vec4( position, 1.0 );
  }
  `;

  const RAW_FRAGMENT_SHADER_PREFIX = `${[
    'precision highp float;',
    'precision highp int;'
  ].join('\n')}\n`;

  const COPY_FRAGMENT_SHADER = `
  uniform sampler2D source;
  uniform vec2 resolution;
  void main() {
    gl_FragColor = texture2D(source, gl_FragCoord.xy / resolution.xy);
  }`;

  const GAMMA_CORRECTION_FRAGMENT_SHADER = `
  uniform sampler2D source;
  uniform vec2 resolution;
  uniform float gamma;
  void main() {
    vec4 src = texture2D(source, gl_FragCoord.xy / resolution.xy);
    gl_FragColor = vec4(pow(src.xyz, vec3(1,1,1) / gamma), src.w);
  }
  `;

  const SRGB_FRAGMENT_SHADER = `
  uniform sampler2D source;
  uniform vec2 resolution;
  void main() {
    // https://gamedev.stackexchange.com/a/148088
    vec4 src = texture2D(source, gl_FragCoord.xy / resolution.xy);
    vec3 cutoff = vec3(lessThan(src.xyz, vec3(0.0031308)));
    vec3 higher = vec3(1.055)*pow(src.xyz, vec3(1.0/2.4)) - vec3(0.055);
    vec3 lower = src.xyz * vec3(12.92);
    gl_FragColor = vec4(higher * (vec3(1.0) - cutoff) + lower * cutoff, src.w);
  }
  `;

  // simple jQuery replacements
  const helpers = {
    getFile(fileUrl, onSuccess, onError) {
      const request = new XMLHttpRequest();
      request.onload = () => {
        if (request.status >= 400) {
          request.onerror(request.statusText);
        } else {
          onSuccess(request.response);
        }
      };
      if (onError) {
        request.onerror = onError;
      } else {
        request.onerror = () => {
          error(`Failed to GET '${fileUrl}'`);
        };
      }
      request.open('get', fileUrl, true);
      request.send();
    },

    getJSON(jsonUrl, onSuccess, onError) {
      helpers.getFile(jsonUrl, (data) => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (err) {
          if (onError) return onError(err.message);
          return error(err.message);
        }
        return onSuccess(parsed);
      }, onError);
    },

    isString(x) {
      // https://stackoverflow.com/a/17772086/1426569
      return Object.prototype.toString.call(x) === '[object String]';
    },

    isObject(x) {
      // https://stackoverflow.com/a/14706877/1426569
      return !Array.isArray(x) && x === Object(x);
    },

    offset(el) {
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top + document.body.scrollTop,
        left: rect.left + document.body.scrollLeft
      };
    }
  };

  function generateRandom(distribution, size) {
    // TODO: Math.random is of low quality on older browsers
    // but Xorshift128+ on newer

    // from https://stackoverflow.com/a/36481059/1426569
    // Standard Normal variate using Box-Muller transform
    function randnBoxMuller() {
      let u = 0; let
        v = 0;
      while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    const generate = () => {
      switch (distribution) {
        case 'uniform':
          return Math.random();
        case 'normal':
          return randnBoxMuller();
        default:
          return error(`invalid random distribution ${distribution}`);
      }
    };

    const sample = [];
    for (let i = 0; i < size; ++i) {
      sample.push(generate());
    }
    return sample;
  }

  function Shader(shaderParams, shaderFolder) {
    const time0 = new Date().getTime();
    const textures = {};
    this.source = null;
    this.params = shaderParams;

    const checkLoaded = () => {
      if (anyErrors) return;
      if (Object.values(textures).filter(x => x === null).length > 0) return;
      if (this.source === null) return;
      init();
    };

    const doStart = (shaderSource) => {
      // console.log(shaderSource);
      this.source = shaderSource;
      checkLoaded();
    };

    if (shaderParams.source) {
      setTimeout(() => doStart(shaderParams.source), 0);
    } else if (shaderParams.source_path) {
      helpers.getFile(shaderFolder + shaderParams.source_path, doStart);
    } else {
      return error('No shader source code defined');
    }

    function buildFixed(value) {
      if (Array.isArray(value)) {
        return new Float32Array(value);
      }
      return value;
    }

    function buildRandom(val) {
      // TODO: this encoding is silly
      const parts = val.split('_');
      const distribution = parts[1];

      let size = 1;
      if (parts.length > 2) {
        size = parts[2];
        if (parts.length > 3 || size > 4) {
          throw new Error(`invalid random ${val}`);
        }
      }

      if (size > 1) {
        return () => new Float32Array(generateRandom(distribution, size));
      }
      return () => generateRandom(distribution, 1)[0];
    }

    function buildDynamic(val) {
      switch (val) {
        case 'time':
          return () => (new Date().getTime() - time0) / 1000.0;
        case 'resolution':
          return () => new Float32Array([
            resolution.x,
            resolution.y
          ]);
        case 'mouse':
          return () => new Float32Array([
            mousePos.x,
            mousePos.y
          ]);
        case 'relative_mouse':
          return () => new Float32Array([
            mousePos.rel_x,
            mousePos.rel_y
          ]);
        case 'frame_number':
          return () => frameNumber;
        case 'previous_frame':
          return () => {
            const curBuffer = frameNumber % 2;
            return frameBuffers[1 - curBuffer].attachments[0];
          };
        default:
          if (val.startsWith('random_')) {
            return buildRandom(val);
          }

          throw new Error(`invalid uniform mapping ${val}`);
      }
    }

    this.uniforms = {};

    const loadTexture = (symbol, filename, options = {}) => {
      textures[symbol] = null;
      twgl.createTexture(gl, Object.assign({
        src: filename,
        mag: gl.NEAREST,
        min: gl.NEAREST
      }, options), (err, tex) => {
        if (err) {
          return error(err);
        }
        textures[symbol] = tex;
        this.uniforms[symbol] = tex;
        return checkLoaded();
      });
    };

    const loadTextureArray = (textureArray, options = {}) => {
      let array = [...textureArray];
      // flatten
      while (array[0].length > 1) array = array.reduce((a, b) => a.concat(b));
      array = new Float32Array(array);

      gl.getExtension('OES_texture_float');
      return twgl.createTexture(gl, Object.assign({
        src: array,
        format: gl.RGBA,
        type: gl.FLOAT,
        mag: gl.NEAREST,
        min: gl.NEAREST,
        wrap: gl.CLAMP_TO_EDGE,
        width: array.length / 4,
        height: 1,
        auto: false
      }, options));
    };

    const boundUniforms = {};

    Object.keys(shaderParams.uniforms).forEach((key) => {
      const val = shaderParams.uniforms[key];

      try {
        if (helpers.isString(val)) {
          const builder = buildDynamic(val);
          boundUniforms[key] = builder;
        } else if (helpers.isObject(val)) {
          if (val.file) {
            loadTexture(key, shaderFolder + val.file);
          } else if (val.data) {
            this.uniforms[key] = loadTextureArray(val.data, {
              width: val.data[0].length,
              height: val.length
            });
          } else if (val.random) {
            const generate = () => new Float32Array(
              generateRandom(val.random.distribution, val.random.size * 4)
            );

            const tex = loadTextureArray(generate());
            this.uniforms[key] = tex;
            boundUniforms[key] = () => {
              gl.bindTexture(gl.TEXTURE_2D, tex);
              const internalFormat = gl.RGBA;
              const format = internalFormat;
              const width = val.random.size;
              const height = 1;
              const type = gl.FLOAT;
              gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat,
                width, height, 0, format, type, generate());
              return tex;
            };
          } else {
            throw new Error(`invalid uniform ${JSON.stringify(val)}`);
          }
        } else {
          this.uniforms[key] = buildFixed(val);
        }
      } catch (err) {
        error(err.message);
      }
    });

    this.update = () => {
      Object.keys(boundUniforms).forEach((key) => {
        this.uniforms[key] = boundUniforms[key]();
      });
    };
  }

  function parseShaderErrorWithContext(msg, code) {
    const match = /\**\s*ERROR:\s*\d+:(\d+)/.exec(msg);
    const errorLineNo = match && match[1];
    if (errorLineNo) {
      const lines = code.split('\n');
      const i = parseInt(errorLineNo, 10) - 1;
      const context = [i - 1, i, i + 1].map(j => ({ lineNo: j + 1, line: lines[j] }))
        .filter(x => x.line !== undefined)
        .map(x => `${x.lineNo}: ${x.line}`)
        .join('\n');

      return `${msg}\n${context}`;
    }

    return `Shader error: ${msg}`;
  }

  const init = () => {
    this.fragmentShaderSource = RAW_FRAGMENT_SHADER_PREFIX + shader.source;
    const programInfo = twgl.createProgramInfo(gl, [
      VERTEX_SHADER_SOURCE,
      this.fragmentShaderSource
    ], {
      errorCallback: (sourceAndError) => {
        const src = this.fragmentShaderSource;
        const errorMsg = sourceAndError.split('\n').slice(src.split('\n').length).join('\n');
        error(parseShaderErrorWithContext(errorMsg, src));
      }
    });

    const copyProgramInfo = twgl.createProgramInfo(gl, [
      VERTEX_SHADER_SOURCE,
      RAW_FRAGMENT_SHADER_PREFIX + COPY_FRAGMENT_SHADER
    ], { errorCallback: error });

    const gammaCorrectionProgramInfo = twgl.createProgramInfo(gl, [
      VERTEX_SHADER_SOURCE,
      RAW_FRAGMENT_SHADER_PREFIX + GAMMA_CORRECTION_FRAGMENT_SHADER
    ], { errorCallback: error });

    const sRgbPostprocessor = twgl.createProgramInfo(gl, [
      VERTEX_SHADER_SOURCE,
      RAW_FRAGMENT_SHADER_PREFIX + SRGB_FRAGMENT_SHADER
    ], { errorCallback: error });

    if (!programInfo
      || !copyProgramInfo
      || !gammaCorrectionProgramInfo
      || !sRgbPostprocessor) return;

    const arrays = {
      position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0]
    };
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

    function checkResize() {
      const width = gl.canvas.clientWidth;
      const height = gl.canvas.clientHeight;
      if (gl.canvas.width !== width
          || gl.canvas.height !== height) {
        gl.canvas.width = width;
        gl.canvas.height = height;
        onResize();
      }
    }

    render = (division = 0, nDivisions = 1) => {
      try {
        const firstDivision = division === 0;
        const lastDivision = division === nDivisions - 1;
        checkResize();

        resolution = {
          x: gl.canvas.clientWidth,
          y: gl.canvas.clientHeight
        };

        if (firstDivision) {
          shader.update();
          if (anyErrors) return;
        }

        gl.useProgram(programInfo.program);
        twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
        twgl.setUniforms(programInfo, shader.uniforms);

        // TODO: rather undescriptive
        if (!shader.params.monte_carlo && !shader.params.float_buffers) {
          // render directly to screen
          twgl.drawBufferInfo(gl, bufferInfo);
        } else {
          const currentTarget = frameBuffers[frameNumber % 2];

          twgl.bindFramebufferInfo(gl, currentTarget);

          if (nDivisions > 1) {
            const rowsBegin = Math.floor(division / nDivisions * resolution.y);
            const rowsEnd = Math.floor((division + 1) / nDivisions * resolution.y);
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(0, rowsBegin, resolution.x, rowsEnd - rowsBegin);
            twgl.drawBufferInfo(gl, bufferInfo);
            gl.disable(gl.SCISSOR_TEST);
          } else {
            twgl.drawBufferInfo(gl, bufferInfo);
          }

          // renderer.render( scene, camera, currentTarget );

          if (lastDivision && frameNumber % this.refreshEvery === 0) {
            let postprocessor;
            const gamma = shader.params.gamma || 1.0;
            const uniforms = {
              source: currentTarget.attachments[0],
              resolution: [resolution.x, resolution.y]
            };
            if (parseFloat(gamma) === 1.0) {
              postprocessor = copyProgramInfo;
            } else if (gamma.toUpperCase && gamma.toUpperCase() === 'SRGB') {
              postprocessor = sRgbPostprocessor;
            } else {
              postprocessor = gammaCorrectionProgramInfo;
              uniforms.gamma = parseFloat(gamma);
            }

            gl.useProgram(postprocessor.program);
            twgl.bindFramebufferInfo(gl, null);
            twgl.setBuffersAndAttributes(gl, postprocessor, bufferInfo);
            twgl.setUniforms(postprocessor, uniforms);

            twgl.drawBufferInfo(gl, bufferInfo);
            if (this.captureCallback) {
              this.captureCallback(canvas.toDataURL('image/png', 1));
              this.captureCallback = null;
            }
          }
        }
        if (lastDivision) frameNumber++;
      } catch (err) {
        error(err.message);
      }
    };

    if (shader.params.resolution) {
      canvas.width = shader.params.resolution[0];
      canvas.height = shader.params.resolution[1];
    }

    onResize();

    // TODO: canvas
    document.onmousemove = (e) => {
      mousePos.x = e.pageX - container.offsetLeft;
      mousePos.y = e.pageY - container.offsetTop;
      mousePos.rel_x = mousePos.x / container.offsetWidth;
      mousePos.rel_y = mousePos.y / container.offsetHeight;
    };

    animate();
  };

  function onResize() {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    // console.log(`resize ${width}x${height}`);

    // https://webglfundamentals.org/webgl/lessons/webgl-anti-patterns.html
    gl.viewport(0, 0, width, height);

    // TODO rather undescriptive
    if (shader.params.monte_carlo || shader.params.float_buffers) {
      const attachments = [{
        format: gl.RGBA,
        type: gl.FLOAT,
        min: gl.NEAREST,
        mag: gl.NEAREST,
        wrap: gl.CLAMP_TO_EDGE
      }];

      if (frameBuffers) {
        frameBuffers.forEach(fb => twgl.resizeFramebufferInfo(gl, fb, attachments, width, height));
      } else {
        gl.getExtension('OES_texture_float');
        // TODO: are these always zero or do they have to be initialized?
        frameBuffers = [
          twgl.createFramebufferInfo(gl, attachments, width, height),
          twgl.createFramebufferInfo(gl, attachments, width, height)
        ];
      }
    }
    frameNumber = 0;
  }

  this.setLoadProfile = (load) => {
    if (load < 0) {
      this.nDivisions = -load;
      this.refreshEvery = 1;
      this.frameGap = 30;
    } else if (load < 1) {
      this.refreshEvery = 5;
      this.nDivisions = 1;
      this.frameGap = Math.ceil((1.0 - load) * 29) + 1;
    } else {
      this.nDivisions = 1;
      this.refreshEvery = 10;
      this.batchSize = Math.round(load);
      this.frameGap = 0;
    }
  };

  this.setLoadProfile(1);

  const animate = () => {
    this.running = true;
    if (shader.params.monte_carlo) {
      let nDivisions = this.nDivisions;
      if (!shader.params.batch_size) {
        this.batchSize = 1;
      } else {
        this.batchSize = shader.params.batch_size;
      }

      let curDivision = 0;
      const renderFrame = () => {
        if (!this.running) return;

        if (curDivision === 0) {
          nDivisions = this.nDivisions;
        }
        for (let i = 0; i < this.batchSize; ++i) {
          render(curDivision, nDivisions);
          curDivision = (curDivision + 1) % nDivisions;
        }

        if (this.frameGap > 1) {
          setTimeout(() => {
            if (this.running) requestAnimationFrame(renderFrame);
          }, this.frameGap);
        } else {
          // with small frame gap, render at maximum speed by dropping
          // requestAnimationFrame, which has a high risk of freezing the
          // UI if the GPU cannot keep up
          setTimeout(renderFrame, this.frameGap);
        }
      };

      setTimeout(renderFrame, 0);

      this.stop = () => {
        this.running = false;
      };
    } else {
      // capped frame rate
      const timer = requestAnimationFrame(animate);
      this.stop = () => {
        cancelAnimationFrame(timer);
        this.running = false;
      };
      render();
    }
  };

  this.resume = () => { animate(); };

  function startShader({ shaderUrl, shaderSpec }) {
    function getFolderName(str) {
      const parts = str.split('/');
      if (parts.length === 1) return '';
      parts.pop();
      let folder = parts.join('/');
      if (parts.pop() !== '') folder += '/'; // add trailing /
      return folder;
    }

    let shaderFolder = '';

    function doStart(shaderParams) {
      if (!shaderParams) {
        error('missing shader spec!');
      }
      this.refreshEvery = parseInt(shaderParams.refresh_every || 1, 10);
      shader = new Shader(shaderParams, shaderFolder);
    }

    if (shaderUrl) {
      if (shaderSpec) return error("can't have both url and spec");
      shaderFolder = getFolderName(shaderUrl);
      helpers.getJSON(shaderUrl, doStart);
    } else {
      doStart(shaderSpec);
    }
    return null;
  }

  startShader({ shaderUrl: url, shaderSpec: spec });
}
