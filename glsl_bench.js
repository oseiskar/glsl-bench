"use strict"
/*global THREE, Detector, $, dat:false */
/*global document, window, setTimeout, requestAnimationFrame:false */

function GLSLBench({element, url, spec}) {

  let scene, camera, mesh, renderer, shader, frameBuffers, frameNumber;
  let mouse_pos = { x: 0, y: 0, rel_x: 0, rel_y: 0 };

  if (!element) {
    throw new Error('Missing attribute: (DOM) element');
  }
  const container = element;

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

  const RAW_FRAGMENT_SHADER_PREFIX = `
  precision highp float;
  precision highp int;
  `;

  const COPY_FRAGMENT_SHADER = `
  uniform sampler2D source;
  uniform vec2 resolution;
  void main() {
    gl_FragColor = texture2D(source, gl_FragCoord.xy / resolution.xy);
  }
  `;

  const trivialShaders = {
    copy: new THREE.RawShaderMaterial({
      uniforms: {
        source: {
          type: 't',
          value: null
        },
        resolution: {
          type: 'vec2',
          value: new THREE.Vector2(0,0)
        }
      },
      vertexShader: VERTEX_SHADER_SOURCE,
      fragmentShader: RAW_FRAGMENT_SHADER_PREFIX + COPY_FRAGMENT_SHADER
    })
  };

  // simple jQuery replacements
  const helpers = {
    getFile(url, onSuccess, onError) {
      const request = new XMLHttpRequest();
      request.onload = (x) => {
        onSuccess(request.response);
      };
      if (onError) {
        request.onerror = onError;
      } else {
        request.onerror = () => {
          throw new Error(`Failed to GET '${url}'`);
        }
      }
      request.open("get", url, true);
      request.send();
    },

    getJSON(url, onSuccess, onError) {
      helpers.getFile(url, data => onSuccess(JSON.parse(data)), onError);
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
          throw new Error('invalid random distribution '+distribution);
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
        throw new Error('No shader source code defined');
    }

    function buildFixed(value) {
        if (Array.isArray(value)) {
            const vec = new THREE['Vector'+value.length](...value);
            return {
                type: "v"+value.length,
                value: vec
            };
        } else {
            return { type: "f", value: value };
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

        let init, updater;

        if (size > 1) {
          init = {
            type: 'v' + size,
            value: new THREE['Vector'+size]()
          };
          updater = (v) => {
            const sample = generateRandom(distribution, size);
            const letters = 'xyzw';
            for (let i = 0; i < size; ++i) {
              v.value[letters[i]] = sample[i];
            }
          };
        } else {
          init = {
            type: 'f',
            value: 0
          };
          updater = (v) => {
            v.value = generateRandom(distribution, 1)[0];
          };
        }

        return { declaration: init, updater };
    }

    function buildDynamic(val) {

        let init = { type: 'f', value: 0.0 };
        let updater = x => {};

        switch(val) {
            case 'time':
                updater = (v) => {
                    v.value = (new Date().getTime() - time0) / 1000.0;
                };
                break;
            case 'resolution':
                init = buildFixed([1,1]);
                updater = (v) => {
                    v.value.x = renderer.domElement.width;
                    v.value.y = renderer.domElement.height;
                };
                break;
            case 'mouse':
                init = buildFixed([0,0]);
                updater = (v) => {
                    v.value.x = mouse_pos.x;
                    v.value.y = mouse_pos.y;
                };
                break;
            case 'relative_mouse':
                init = buildFixed([0,0]);
                updater = (v) => {
                    v.value.x = mouse_pos.rel_x;
                    v.value.y = mouse_pos.rel_y;
                };
                break;
            case 'frame_number':
                updater = (v) => {
                  v.value = frameNumber;
                };
                break;
            case 'previous_frame':
                init = {
                    type: "t",
                    value: null
                };
                updater = (v) => {
                    const curBuffer = frameNumber % 2;
                    v.value = frameBuffers[1 - curBuffer].texture;
                };
                break;
            default:
                if (val.startsWith('random_')) {
                  return buildRandom(val);
                }
                else {
                  throw "invalid uniform mapping " + val;
                }
        }

        return { declaration: init, updater: updater };
    }

    this.uniforms = {};

    const texLoader = new THREE.TextureLoader();
    const loadTexture = (symbol, filename, interpolation) => {
        textures[symbol] = null;
        texLoader.load(filename, (tex) => {
            tex.magFilter = interpolation;
            tex.minFilter = interpolation;
            textures[symbol] = tex;
            this.uniforms[symbol] = {
                type: "t",
                value: tex
            };
            checkLoaded();
        });
    }

    const bound_uniforms = {};

    for (let key in shader_params.uniforms) {
        const val = shader_params.uniforms[key];

        if (helpers.isString(val)) {
          const builder = buildDynamic(val);
          bound_uniforms[key] = builder;
          this.uniforms[key] = builder.declaration;
        } else if (helpers.isObject(val)) {
          loadTexture(key, shader_folder + val.file, THREE.NearestFilter);
        } else {
          this.uniforms[key] = buildFixed(val);
        }
    }

    this.update = () => {
        for (let key in bound_uniforms) {
            bound_uniforms[key].updater(this.uniforms[key]);
        }
    };
  }

  function createRenderTarget(sizeX, sizeY) {
		return new THREE.WebGLRenderTarget(sizeX, sizeY, {
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        // iPads/pods/phones don't necessarily support this
        type: THREE.FloatType,
        stencilBuffer: false,
        depthBuffer: false
    });
  }

  function init() {
    scene = new THREE.Scene();

    const geometry = new THREE.PlaneBufferGeometry( 2, 2 );

    shader.material = new THREE.RawShaderMaterial({
        uniforms: shader.uniforms,
        vertexShader: VERTEX_SHADER_SOURCE,
        fragmentShader:
          RAW_FRAGMENT_SHADER_PREFIX +
          shader.source
    });

    mesh = new THREE.Mesh( geometry, shader.material );
    scene.add( mesh );

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio( window.devicePixelRatio );

    container.appendChild( renderer.domElement );

    if (shader.params.resolution === 'auto') {
      onWindowResize();
    } else {
      setSize(shader.params.resolution[0], shader.params.resolution[1]);
    }
    window.addEventListener( 'resize', onWindowResize, false );

    document.onmousemove = (e) => {
      const offset = helpers.offset(container);
      mouse_pos.x = e.pageX - container.offsetLeft;
      mouse_pos.y = e.pageY - container.offsetTop;
      mouse_pos.rel_x = mouse_pos.x / container.offsetWidth;
      mouse_pos.rel_y = mouse_pos.y / container.offsetHeight;
    };

    animate();
  }

  function setSize(sizeX, sizeY) {
    renderer.setSize(sizeX, sizeY);
    camera = new THREE.PerspectiveCamera( 45, sizeX / sizeY, 1, 80000 );

    trivialShaders.copy.uniforms.resolution.value.x = sizeX;
    trivialShaders.copy.uniforms.resolution.value.y = sizeY;

    if (frameBuffers) frameBuffers.forEach(fb => fb.dispose());

    // TODO rather undescriptive
    if (shader.params.monte_carlo || shader.params.float_buffers) {
      // TODO: are these always zero or do they have to be initialized?
      frameBuffers = [
        createRenderTarget(sizeX, sizeY),
        createRenderTarget(sizeX, sizeY)
      ];
    }
    frameNumber = 0;

    shader.update();
  }

  function onWindowResize( event ) {
    console.log('window size changed');
    if (shader.params.resolution === 'auto') {
      setSize(window.innerWidth, window.innerHeight);
    }
  }

  function animate() {
    if (shader.params.monte_carlo) {
      // render as fast as possible
      const renderBatchSize = parseInt(shader.params.batch_size || 1);
      const timer = setInterval(() => {
        for (let i = 0; i < renderBatchSize; ++i) {
          render();
        }
      }, 0);
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

  function parseShaderError(diagnostics, code) {
    const msg = diagnostics.fragmentShader.log;
    const match = /ERROR:\s*\d+:(\d+)/.exec(msg);
    const errorLineNo = match && match[1];
    if (errorLineNo) {
      const lines = code.split('\n');
      const i = parseInt(errorLineNo)-1;
      const msg = [i-1, i, i+1].map(j => ({ lineNo: j+1, line: lines[j]}))
        .filter(x => x.line)
        .map(x => `${x.lineNo}: ${x.line}`)
        .join('\n');

      return '\n' + msg;
    }

    return `Could not interpret error: ${msg} (${JSON.stringify(diagnostics)})`;
  }

  function render() {
    shader.update();

    function tryRender(f) {
      f();
      if (shader.material.program.diagnostics) {
        console.log();
        shader.stop();
        throw new Error(parseShaderError(shader.material.program.diagnostics, shader.material.program.code));
      }
    }

    // TODO: rather undescriptive
    if (!shader.params.monte_carlo && !shader.params.float_buffers) {
      // render directly to screen
      tryRender(() => { renderer.render( scene, camera ); });
      ;
    } else {
      const currentTarget = frameBuffers[frameNumber % 2];
      tryRender(() => { renderer.render( scene, camera, currentTarget ); });

      const refreshEvery = parseInt(shader.params.refresh_every || 1);
      if (frameNumber % refreshEvery === 0) {
        const curMaterial = mesh.material;
        const copyParams = trivialShaders.copy.uniforms;

        mesh.material = trivialShaders.copy;
        copyParams.source.value = currentTarget.texture;

        renderer.render( scene, camera );
        mesh.material = curMaterial;
      }
    }

    frameNumber++;
  }

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
      shader = new Shader(shaderParams, shaderFolder);
    }

    if (url) {
      if (spec) throw new Error("can't have both url and spec");
      shaderFolder = getFolderName(url);
      helpers.getJSON(url, doStart);
    } else {
      doStart(spec);
    }
  }

  startShader({url, spec});
}
