const tracerData = require('../../glsl/index.js');
const autoName = require('../auto_tracer_name.js');
const tracerCode = tracerData.surfaces['sphere.glsl'];
const tracerName = autoName(tracerCode);

function Sphere(radius) {
  this.name = tracerName;
  this.code = tracerCode;
  this.parameters = [radius];
}

module.exports = Sphere;
