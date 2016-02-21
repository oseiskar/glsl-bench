
uniform vec2 resolution;
uniform float radius;
uniform float t;
uniform sampler2D base_image;

varying vec3 pos;

#define SQ(x) ((x)*(x))
#define FOV_MULT 3.0
const vec3 cam_x = vec3(1.0, 0.0, 0.0);
const vec3 cam_y = vec3(0.0, 0.0, 1.0);
const vec3 cam_z = vec3(0.0, 1.0, 0.0);
const vec3 cam_pos = vec3(0.0, -4.0, 0.5);

const vec3 sphere_pos = vec3(0.0, 0.0, 0.5);
const float sphere_r = 0.5;
const vec3 light_pos = vec3(-1.0, -2.0, 1.0);
const vec3 sphere_diffuse = vec3(1.0, 0.3, 0.4);

float sphere_intersection(vec3 pos, vec3 ray, vec3 sphere_pos, float sphere_r) {

    // ray-sphere intersection
    vec3 d = pos - sphere_pos;

    float dotp = dot(d,ray);
    float c_coeff = dot(d,d) - SQ(sphere_r);
    float ray2 = dot(ray, ray);
    float discr = dotp*dotp - ray2*c_coeff;

    if (discr < 0.0) return -1.0;
    return (-dotp - sqrt(discr)) / ray2;
}

void main() {

    vec3 ray = normalize(pos.x*cam_x + pos.y*cam_y + FOV_MULT*cam_z);

    float isec_dist = sphere_intersection(cam_pos, ray, sphere_pos, sphere_r);

    vec3 cur_color = vec3(0.5, 0.5, 0.5);

    if (isec_dist > 0.0) {
        vec3 isec_point = cam_pos + ray*isec_dist;
        vec3 isec_normal = (isec_point - sphere_pos) / sphere_r;
        vec3 light_dir = normalize(light_pos - isec_point);

        float lightness = max(dot(light_dir, isec_normal), 0.0);
        cur_color = lightness * sphere_diffuse;
    }

    vec3 base_color = texture2D(base_image, gl_FragCoord.xy / resolution.xy).xyz;
    gl_FragColor = vec4(base_color + cur_color, 1.0);
}
