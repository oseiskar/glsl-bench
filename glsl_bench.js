"use strict"
/*global twgl, document, window, setTimeout, requestAnimationFrame:false */

// quite sphagetti but gets the job done

function GLSLBench({element, url, spec}) {

  let anyErrors = false;

  let errorCallback = (errorText) => {
    throw new Error(errorText);
  };

  function error(errorText) {
    anyErrors = true;
    errorCallback(errorText);
  }

  this.onError = function (callback) {
    errorCallback = callback;
  };

  let render, shader, frameBuffers, frameNumber, resolution;
  let mouse_pos = { x: 0, y: 0, rel_x: 0, rel_y: 0 };

  if (!element) {
    return error('Missing attribute: (DOM) element');
  }

  // try to initialize WebGL
  const container = element;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext("webgl");

  if (gl === null) {
    return error("Unable to initialize WebGL. Your browser or machine may not support it.");
  }

  this.destroy = function () {
    if (shader) shader.stop();
    if (canvas) canvas.parentNode.removeChild(canvas);
  }

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

  const RAW_FRAGMENT_SHADER_PREFIX = [
    "precision highp float;",
    "precision highp int;"
  ].join("\n") + "\n";

  const COPY_FRAGMENT_SHADER = `
  uniform sampler2D source;
  uniform vec2 resolution;
  void main() {
    gl_FragColor = texture2D(source, gl_FragCoord.xy / resolution.xy);
  }
  `;

  // simple jQuery replacements
  const helpers = {
    getFile(url, onSuccess, onError) {
      const request = new XMLHttpRequest();
      request.onload = (x) => {
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
          error(`Failed to GET '${url}'`);
        }
      }
      request.open("get", url, true);
      request.send();
    },

    getJSON(url, onSuccess, onError) {
      helpers.getFile(url, data => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (err) {
          if (onError) return onError(err.message);
          else return error(err.message);
        }
        onSuccess(parsed);
      }, onError);
    },

    isString(x) {
      // https://stackoverflow.com/a/17772086/1426569
      return Object.prototype.toString.call(x) === "[object String]";
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
  }

  function generateRandom(distribution, size) {

    // TODO: Math.random is of low quality on older browsers
    // but Xorshift128+ on newer

    // from https://stackoverflow.com/a/36481059/1426569
    // Standard Normal variate using Box-Muller transform
    function randnBoxMuller() {
      var u = 0, v = 0;
      while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
      while(v === 0) v = Math.random();
      return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    }

    const generate = () => {
      switch (distribution) {
        case 'uniform':
          return Math.random();
        case 'normal':
          return randnBoxMuller();
        default:
          return error('invalid random distribution '+distribution);
      }
    }

    const sample = [];
    for (let i=0; i<size; ++i) {
      sample.push(generate());
    }
    return sample;
  }

  function Shader(shader_params, shader_folder) {

    const time0 = new Date().getTime();
    const textures = {};
    this.source = null;
    this.params = shader_params;

    const checkLoaded = () => {
      if (anyErrors) return;
      for (let key in textures) if (textures[key] === null) return;
      if (this.source === null) return;
      init();
    };

    const doStart = (shader_source) => {
        //console.log(shader_source);
        this.source = shader_source;
        checkLoaded();
    };

    if (shader_params.source) {
        setTimeout(() => doStart(shader_params.source), 0);
    } else if (shader_params.source_path) {
        helpers.getFile(shader_folder + shader_params.source_path, doStart);
    } else {
        return error('No shader source code defined');
    }

    function buildFixed(value) {
      if (Array.isArray(value)) {
        return new Float32Array(value);
      } else {
        return value;
      }
    }

    function buildRandom(val) {
      // TODO: this encoding is silly
      const parts = val.split('_');
      const distribution = parts[1];

      let size = 1;
      if (parts.length > 2) {
        size = parts[2];
        if (parts.length > 3 || size > 4) {
          throw new Error('invalid random '+val);
        }
      }

      if (size > 1) {
        return () => {
          return new Float32Array(generateRandom(distribution, size));
        };
      } else {
        return () => {
          return generateRandom(distribution, 1)[0];
        };
      }
    }

    function buildDynamic(val) {
      switch(val) {
        case 'time':
          return (v) => {
            return (new Date().getTime() - time0) / 1000.0;
          };
        case 'resolution':
          return () => {
            return new Float32Array([
              resolution.x,
              resolution.y
            ]);
          };
        case 'mouse':
          return () => {
            return new Float32Array([
              mouse_pos.x,
              mouse_pos.y
            ]);
          };
        case 'relative_mouse':
          return () => {
            return new Float32Array([
              mouse_pos.rel_x,
              mouse_pos.rel_y
            ]);
          };
        case 'frame_number':
          return () => {
            return frameNumber;
          };
          break;
        case 'previous_frame':
          return () => {
            const curBuffer = frameNumber % 2;
            return frameBuffers[1 - curBuffer].attachments[0];
          };
        default:
          if (val.startsWith('random_')) {
            return buildRandom(val);
          }
          else {
            throw new Error("invalid uniform mapping " + val);
          }
      }
    }

    this.uniforms = {};

    const loadTexture = (symbol, filename, options = {}) => {
      textures[symbol] = null;
      twgl.createTexture(gl, Object.assign({
        src: filename,
        mag: gl.NEAREST,
        min: gl.NEAREST
      }, options), (err, tex, source) => {
        if (err) {
          return error(err);
        }
        textures[symbol] = tex;
        this.uniforms[symbol] = tex;
        checkLoaded();
      });
    }

    const bound_uniforms = {};

    for (let key in shader_params.uniforms) {
      const val = shader_params.uniforms[key];

      try {
        if (helpers.isString(val)) {
          const builder = buildDynamic(val);
          bound_uniforms[key] = builder;
          this.uniforms[key] = builder.declaration;
        } else if (helpers.isObject(val)) {
          loadTexture(key, shader_folder + val.file);
        } else {
          this.uniforms[key] = buildFixed(val);
        }
      } catch (err) {
        return error(err.message);
      }
    }

    this.update = () => {
      for (let key in bound_uniforms) {
        this.uniforms[key] = bound_uniforms[key]();
      }
    };
  }

  function parseShaderErrorWithContext(msg, code) {
    const match = /\**\s*ERROR:\s*\d+:(\d+)/.exec(msg);
    const errorLineNo = match && match[1];
    if (errorLineNo) {
      const lines = code.split('\n');
      const i = parseInt(errorLineNo)-1;
      const context = [i-1, i, i+1].map(j => ({ lineNo: j+1, line: lines[j]}))
        .filter(x => x.line !== undefined)
        .map(x => `${x.lineNo}: ${x.line}`)
        .join('\n');

      return msg + '\n' + context;
    }

    return `Shader error: ${msg}`;
  }

  const init = () => {
    this.fragmentShaderSource = RAW_FRAGMENT_SHADER_PREFIX + shader.source;
    const programInfo = twgl.createProgramInfo(gl, [
      VERTEX_SHADER_SOURCE,
      this.fragmentShaderSource
    ], { errorCallback: (sourceAndError) => {
      const src = this.fragmentShaderSource;
      const errorMsg = sourceAndError.split("\n").slice(src.split("\n").length).join("\n");
      error(parseShaderErrorWithContext(errorMsg, src));
    }});

    const copyProgramInfo = twgl.createProgramInfo(gl, [
      VERTEX_SHADER_SOURCE,
      RAW_FRAGMENT_SHADER_PREFIX + COPY_FRAGMENT_SHADER
    ], { errorCallback: error });

    if (!programInfo || !copyProgramInfo) return;

    const arrays = {
      position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
    };
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

    function checkResize() {
      const width = gl.canvas.clientWidth;
      const height = gl.canvas.clientHeight;
      if (gl.canvas.width != width ||
          gl.canvas.height != height) {
         gl.canvas.width = width;
         gl.canvas.height = height;
         onResize();
      }
    }

    render = () => {
      try {
        checkResize();

        resolution = {
          x: gl.canvas.clientWidth,
          y: gl.canvas.clientHeight
        };

        shader.update();
        if (anyErrors) return;

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
          twgl.drawBufferInfo(gl, bufferInfo);

          // renderer.render( scene, camera, currentTarget );

          const refreshEvery = parseInt(shader.params.refresh_every || 1);
          if (frameNumber % refreshEvery === 0) {
            gl.useProgram(copyProgramInfo.program);
            twgl.bindFramebufferInfo(gl, null);
            twgl.setBuffersAndAttributes(gl, copyProgramInfo, bufferInfo);
            twgl.setUniforms(copyProgramInfo, {
              source: currentTarget.attachments[0],
              resolution: [resolution.x, resolution.y]
            });

            twgl.drawBufferInfo(gl, bufferInfo);
          }
        }
        frameNumber++;

        twgl.drawBufferInfo(gl, bufferInfo);
      } catch (err) {
        error(err.message);
      }
    }

    if (shader.params.resolution) {
      canvas.width = shader.params.resolution[0];
      canvas.height = shader.params.resolution[1];
    }

    onResize();

    // TODO: canvas
    document.onmousemove = (e) => {
      const offset = helpers.offset(container);
      mouse_pos.x = e.pageX - container.offsetLeft;
      mouse_pos.y = e.pageY - container.offsetTop;
      mouse_pos.rel_x = mouse_pos.x / container.offsetWidth;
      mouse_pos.rel_y = mouse_pos.y / container.offsetHeight;
    };

    animate();
  }

  function onResize() {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    //console.log(`resize ${width}x${height}`);

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
        frameBuffers.forEach(fb =>
          twgl.resizeFramebufferInfo(gl, fb, attachments, width, height));
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

  function animate() {
    if (shader.params.monte_carlo) {
      const minDelayMs = 1; // not with an absurd frame rate though

      // render as fast as possible
      const renderBatchSize = parseInt(shader.params.batch_size || 1);
      const timer = setInterval(() => {
        for (let i = 0; i < renderBatchSize; ++i) {
          render();
        }
      }, minDelayMs);
      shader.stop = () => clearInterval(timer);
    } else {
      // capped frame rate
      const timer = requestAnimationFrame( animate );
      shader.stop = () => cancelAnimationFrame(timer);
    }
    render();
  }

  const getFrameDuration = (() => {
    let lastTimestamp = new Date().getTime();
    return () => {
        const timestamp = new Date().getTime();
        const diff = (timestamp - lastTimestamp) / 1000.0;
        lastTimestamp = timestamp;
        return diff;
    };
  })();

  function startShader({url, spec}) {
    function getFolderName(str) {
        const parts = str.split('/');
        if (parts.length == 1) return '';
        parts.pop();
        let folder = parts.join('/');
        if (parts.pop() !== '') folder += '/'; // add trailing /
        return folder;
    }

    let shaderFolder = '/';

    function doStart(shaderParams) {
      if (!shaderParams) {
        error('missing shader spec!');
      }
      shader = new Shader(shaderParams, shaderFolder);
    }

    if (url) {
      if (spec) return error("can't have both url and spec");
      shaderFolder = getFolderName(url);
      helpers.getJSON(url, doStart);
    } else {
      doStart(spec);
    }
  }

  startShader({url, spec});
}
