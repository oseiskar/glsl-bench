
// Fragment shader

uniform vec2 resolution;
uniform float t;
uniform sampler2D base_image;

varying vec3 pos;

void main() {

    vec2 center = vec2(cos(t)*0.4, sin(t)*0.3);
    vec3 base_color = texture2D(base_image, gl_FragCoord.xy / resolution.xy).xyz;

    vec3 cur_color = vec3(0.0,0.0,0.0);

    if (length(center-pos.xy) < 0.2)
        cur_color = vec3(1.0, 1.0, 0.5);

    gl_FragColor = vec4(base_color + cur_color, 1.0);
}
