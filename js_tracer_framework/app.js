const dynamicTracers = require('./browserified.js');

const params = new URLSearchParams(window.location.search);
const runtimeShaderParams = {};
if (params.has('fullscreen')) {
  document.getElementsByTagName('body')[0].className += ' fullscreen';
  runtimeShaderParams.resolution = 'auto';
}
if (params.has('batch_size')) {
  runtimeShaderParams.batch_size = parseInt(params.get('batch_size'));
}

const element = document.getElementById('shader-container');
const spec = dynamicTracers[params.get('tracer')];
for (let param in runtimeShaderParams) {
  spec[param] = runtimeShaderParams[param];
}

const bench = new GLSLBench({ element, spec });
bench.onError((err) => {
  console.log(("\n"+bench.fragmentShaderSource).split("\n"));
  throw new Error(err);
});
