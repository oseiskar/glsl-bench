"use strict"
/*global THREE, Mustache, Detector, $, dat:false */
/*global document, window, setTimeout, requestAnimationFrame:false */
/*global ProceduralTextures:false */

if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

let container, scene, camera, mesh, renderer, shader, frameBuffers, frameNumber;
let mouse_pos = { x: 0, y: 0, rel_x: 0, rel_y: 0 };

const VERTEX_SHADER_SOURCE = $('#vertex-shader').text();

const trivialShaders = {
  copy: new THREE.ShaderMaterial({
      uniforms: {
        scale: {
          type: 'f',
          value: 1.0
        },
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
      fragmentShader: $('#copy-fragment-shader').text()
  })
};

function startShader(shader_json_filename) {
    const shader_folder = getFolderName(shader_json_filename);
    $.getJSON(shader_json_filename, function(shader_params) {
        shader = new Shader(shader_params, shader_folder);
    });
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

    $.ajax(shader_folder + shader_params.source_path,
        { contentType: 'text/plain' }).done((shader_source) => {
            if (shader_params.mustache)
                shader_source = Mustache.render(shader_source, shader_params.mustache);
            this.source = shader_source;
            checkLoaded();
        });

    function buildFixed(value) {
        if ($.type(value) === "array") {
            const vec = new THREE['Vector'+value.length](...value);
            return {
                type: "v"+value.length,
                value: vec
            };
        } else {
            return { type: "f", value: value };
        }
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
                throw "invalid uniform mapping " + val;
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

        switch ($.type(val)) {
            case "string":
                const builder = buildDynamic(val);
                bound_uniforms[key] = builder;
                this.uniforms[key] = builder.declaration;
                break;
            case "object": // texture
                loadTexture(key, shader_folder + val.file, THREE.NearestFilter);
                break;
            default:
                this.uniforms[key] = buildFixed(val);
                break;
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

    container = document.createElement( 'div' );
    document.body.appendChild( container );

    scene = new THREE.Scene();

    const geometry = new THREE.PlaneBufferGeometry( 2, 2 );

    const material = new THREE.ShaderMaterial({
        uniforms: shader.uniforms,
        vertexShader: VERTEX_SHADER_SOURCE,
        fragmentShader: shader.source
    });

    mesh = new THREE.Mesh( geometry, material );
    scene.add( mesh );

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio( window.devicePixelRatio );
    container.appendChild( renderer.domElement );

    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 80000 );

    onWindowResize();
    window.addEventListener( 'resize', onWindowResize, false );

    $(document).mousemove((e) => {
        const offset = $(container).offset();
        mouse_pos.x = e.pageX - container.offsetLeft;
        mouse_pos.y = e.pageY - container.offsetTop;
        mouse_pos.rel_x = mouse_pos.x / container.offsetWidth;
        mouse_pos.rel_y = mouse_pos.y / container.offsetHeight;
    });

    animate();
}

function onWindowResize( event ) {
    const sizeX = window.innerWidth;
    const sizeY = window.innerHeight;
    renderer.setSize(sizeX, sizeY);

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

function animate() {
    requestAnimationFrame( animate );
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

function render() {
    shader.update();

    // TODO: rather undescriptive
    if (!shader.params.monte_carlo && !shader.params.float_buffers) {
      // render directly to screen
      renderer.render( scene, camera );
    } else {
      const currentTarget = frameBuffers[frameNumber % 2];
      renderer.render( scene, camera, currentTarget );

      const refreshEvery = parseInt(shader.params.refresh_every || 1);
      if (frameNumber % refreshEvery === 0) {
        const curMaterial = mesh.material;
        const copyParams = trivialShaders.copy.uniforms;

        mesh.material = trivialShaders.copy;
        copyParams.source.value = currentTarget.texture;

        if (shader.params.monte_carlo) {
          copyParams.scale.value = 1.0 / Math.max(1, frameNumber);
        }

        renderer.render( scene, camera );
        mesh.material = curMaterial;
      }
    }

    frameNumber++;
}

// stupid helpers
function parseQueryString() {
    const params = {};
    const qstring = window.location.search.split('?')[1];
    if (qstring === undefined) return params;
    const strs = qstring.split('&');
    for (let i in strs) {
        const nameAndValue = strs[i].split('=');
        params[nameAndValue[0]] = decodeURIComponent(nameAndValue[1]);
    }
    return params;
}

function getFolderName(str) {
    const parts = str.split('/');
    if (parts.length == 1) return '';
    parts.pop();
    let folder = parts.join('/');
    if (parts.pop() !== '') folder += '/'; // add trailing /
    return folder;
}
