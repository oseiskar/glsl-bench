
#define M_PI 3.14159265358979323846

uniform vec2 mouse;
uniform vec2 resolution;
uniform float radius;
uniform float t;
uniform sampler2D base_image;
uniform sampler2D classy_texture;

varying vec3 pos;

#define SQ(x) ((x)*(x))

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

    // rotating camera
    float cam_theta = mouse.x * 2.0*M_PI;
    float cam_phi = (mouse.y-0.5) * M_PI;
    const float cam_dist = 6.0;
    vec3 camera_target = vec3(0.0, 0.0, 0.5);

    float sphere_r = 0.5 + sin(t*1.5)*0.2;
    const vec3 light_pos = vec3(1.0, 2.0, 1.0);
    vec3 sphere_pos = vec3(sin(t*1.0), cos(t*2.0), 0.5 + sin(t*0.7));

    vec3 cam_z = vec3(cos(cam_theta), sin(cam_theta), 0.0);
    vec3 cam_x = vec3(cam_z.y, -cam_z.x, 0.0);
    vec3 cam_y, cam_pos;

    cam_z = cos(cam_phi)*cam_z + vec3(0,0,sin(cam_phi));
    cam_y = cross(cam_x, cam_z);
    cam_pos = -cam_z * cam_dist + camera_target;

    // raytracer
    const float FOV_MULT = 3.0;
    vec3 ray = normalize(pos.x*cam_x + pos.y*cam_y + FOV_MULT*cam_z);

    float isec_dist = sphere_intersection(cam_pos, ray, sphere_pos, sphere_r);

    vec3 cur_color = vec3(0.3, 0.3, 0.3);

    if (isec_dist > 0.0) {
        vec3 isec_point = cam_pos + ray*isec_dist;
        vec3 isec_normal = (isec_point - sphere_pos) / sphere_r;
        vec3 light_dir = normalize(light_pos - isec_point);

        float lightness = max(dot(light_dir, isec_normal), 0.0);

        vec2 tex_coord = isec_normal.xz * 0.5 + 0.5;
        cur_color = lightness * texture2D(classy_texture, tex_coord);
    }

    vec3 base_color = texture2D(base_image, gl_FragCoord.xy / resolution.xy).xyz;
    const float motion_blur = 0.95;
    gl_FragColor = vec4(base_color*motion_blur + cur_color *(1.0-motion_blur), 1.0);
}
