"use strict"
/*global THREE, Mustache, Detector, $, dat:false */
/*global document, window, setTimeout, requestAnimationFrame:false */
/*global ProceduralTextures:false */

if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

var container, scene, camera, renderer, shader;
var mouse_pos = { x: 0, y: 0, rel_x: 0, rel_y: 0 };

function startShader(shader_json_filename) {
    var shader_folder = getFolderName(shader_json_filename);
    $.getJSON(shader_json_filename, function(shader_params) {
        shader = new Shader(shader_params, shader_folder);
    });
}

function Shader(shader_params, shader_folder) {

    var that = this;

    var time0 = new Date().getTime();
    var textures = {};
    this.source = null;

    function checkLoaded() {
        for (var key in textures) if (textures[key] === null) return;
        if (that.source === null) return;
        init();
    }

    $.ajax(shader_folder + shader_params.source_path,
        { contentType: 'text/plain' }).done(function (shader_source) {
            if (shader_params.mustache)
                shader_source = Mustache.render(shader_source, shader_params.mustache);
            that.source = shader_source;
            checkLoaded();
        });

    function buildFixed(value) {
        if ($.type(value) === "array") {
            var vec = new THREE['Vector'+value.length](...value);
            return {
                type: "v"+value.length,
                value: vec
            };
        } else {
            return { type: "f", value: value };
        }
    }

    function buildDynamic(val) {

        var init = { type: 'f', value: 0.0 }, updater = (function(x) {});

        switch(val) {
            case 'time':
                updater = function (v) {
                    v.value = (new Date().getTime() - time0) / 1000.0;
                };
                break;
            case 'resolution':
                init = buildFixed([1,1]);
                updater = function (v) {
                    v.value.x = renderer.domElement.width;
                    v.value.y = renderer.domElement.height;
                };
                break;
            case 'mouse':
                init = buildFixed([0,0]);
                updater = function (v) {
                    v.value.x = mouse_pos.x;
                    v.value.y = mouse_pos.y;
                };
                break;
            case 'relative_mouse':
                init = buildFixed([0,0]);
                updater = function (v) {
                    v.value.x = mouse_pos.rel_x;
                    v.value.y = mouse_pos.rel_y;
                };
                break;
            default:
                throw "invalid uniform mapping " + val;
        }

        return { declaration: init, updater: updater };
    }

    this.uniforms = {};

    var texLoader = new THREE.TextureLoader();
    function loadTexture(symbol, filename, interpolation) {
        textures[symbol] = null;
        texLoader.load(filename, function(tex) {
            tex.magFilter = interpolation;
            tex.minFilter = interpolation;
            textures[symbol] = tex;
            that.uniforms[symbol] = {
                type: "t",
                value: tex
            };
            checkLoaded();
        });
    }

    var bound_uniforms = {};

    for (var key in shader_params.uniforms) {
        var val = shader_params.uniforms[key];

        switch ($.type(val)) {
            case "string":
                var builder = buildDynamic(val);
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

    this.update = function() {
        for (var key in bound_uniforms) {
            bound_uniforms[key].updater(that.uniforms[key]);
        }
    };
}

function init(shader_source) {

    container = document.createElement( 'div' );
    document.body.appendChild( container );

    scene = new THREE.Scene();

    var geometry = new THREE.PlaneBufferGeometry( 2, 2 );

    var material = new THREE.ShaderMaterial({
        uniforms: shader.uniforms,
        vertexShader: $('#vertex-shader').text(),
        fragmentShader: shader.source
    });

    var mesh = new THREE.Mesh( geometry, material );
    scene.add( mesh );

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio( window.devicePixelRatio );
    container.appendChild( renderer.domElement );

    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 80000 );

    onWindowResize();
    window.addEventListener( 'resize', onWindowResize, false );

    $(document).mousemove(function(e){
        var offset = $(container).offset();
        mouse_pos.x = e.pageX - container.offsetLeft;
        mouse_pos.y = e.pageY - container.offsetTop;
        mouse_pos.rel_x = mouse_pos.x / container.offsetWidth;
        mouse_pos.rel_y = mouse_pos.y / container.offsetHeight;
    });

    animate();
}

function onWindowResize( event ) {
    renderer.setSize( window.innerWidth, window.innerHeight );
    shader.update();
}

function animate() {
    requestAnimationFrame( animate );
    render();
}

var getFrameDuration = (function() {
    var lastTimestamp = new Date().getTime();
    return function() {
        var timestamp = new Date().getTime();
        var diff = (timestamp - lastTimestamp) / 1000.0;
        lastTimestamp = timestamp;
        return diff;
    };
})();

function render() {
    shader.update();
    renderer.render( scene, camera );
}

// stupid helpers
function parseQueryString() {
    var params = {};
    var qstring = window.location.search.split('?')[1];
    if (qstring === undefined) return params;
    var strs = qstring.split('&');
    for (var i in strs) {
        var nameAndValue = strs[i].split('=');
        params[nameAndValue[0]] = decodeURIComponent(nameAndValue[1]);
    }
    return params;
}

function getFolderName(str) {
    var parts = str.split('/');
    if (parts.length == 1) return '';
    parts.pop();
    var folder = parts.join('/');
    if (parts.pop() !== '') folder += '/'; // add trailing /
    return folder;
}
