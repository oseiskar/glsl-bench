const tracerData = require('../../glsl/index.js');
const autoName = require('../auto_tracer_name.js');
const tracerCode = tracerData.surfaces['box_interior.glsl'];
const tracerName = autoName(tracerCode);

function BoxInterior(width, height, depth) {
  this.name = tracerName;
  this.code = tracerCode;
  this.parameters = [`vec3(${width}, ${height}, ${depth})`];
}

module.exports = BoxInterior;
