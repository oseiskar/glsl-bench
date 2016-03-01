
#define M_PI 3.14159265358979323846

uniform vec2 mouse;
uniform vec2 resolution;
uniform float radius;
uniform float t;
uniform vec2 tent_filter;
uniform vec3 random_direction_1, random_direction_2;

uniform sampler2D base_image;
uniform sampler2D classy_texture;

#define SQ(x) ((x)*(x))
#define NO_INTERSECTION vec4(0.0, 0.0, 0.0, -1.0)

vec4 sphere_intersection(vec3 pos, vec3 ray, vec3 sphere_pos, float sphere_r) {

    // ray-sphere intersection
    vec3 d = pos - sphere_pos;

    float dotp = dot(d,ray);
    float c_coeff = dot(d,d) - SQ(sphere_r);
    float ray2 = dot(ray, ray);
    float discr = dotp*dotp - ray2*c_coeff;

    if (discr < 0.0) return NO_INTERSECTION;

    float dist = (-dotp - sqrt(discr)) / ray2;
    vec3 normal = (pos + ray*dist - sphere_pos) / sphere_r;

    return vec4(normal, dist);
}

vec4 plane_intersection(vec3 pos, vec3 ray, vec3 plane_normal, float plane_h) {
    float dist = (plane_h - dot(pos, plane_normal)) / dot(ray,plane_normal);
    return vec4(plane_normal, dist);
}

float tent_filter_transformation(float x) {
    x *= 2.0;
    if (x < 1.0) return sqrt(x) - 1.0;
    return 1.0 - sqrt(2.0 - x);
}

vec2 get_ccd_pos(vec2 screen_pos) {
    float aspect = resolution.y / resolution.x;
    vec2 jittered_pos = screen_pos + vec2(
            tent_filter_transformation(tent_filter.x),
            tent_filter_transformation(tent_filter.y));
    return ((jittered_pos / resolution.xy) * 2.0 - 1.0) * vec2(1.0, aspect);
}

#define OBJ_NONE 0
#define OBJ_SPHERE 1
#define OBJ_PLANE 2
#define OBJ_LIGHT 3

#define N_BOUNCES 2

void main() {

    // scene geometry
    const vec3 light_pos = vec3(-5.0, 2.0, 8.0);
    const float light_r = 2.5;
    const vec3 light_emission = vec3(1.0, 1.0, 1.0);

    const vec3 sphere_pos = vec3(0.0, 0.0, 0.5);
    const float sphere_r = 0.5;
    const vec3 sphere_diffuse = vec3(1.0, 0.3, 0.4);

    const float plane_h = -0.0;
    const vec3 plane_normal = vec3(0.0, 0.0, 1.0);
    const vec3 plane_diffuse = vec3(0.7, 0.7, 0.7);

    // define camera
    const float cam_theta = 0.0;
    const float cam_phi = 0.0;
    const float cam_dist = 6.0;
    vec3 camera_target = vec3(0.0, 0.0, 0.5);

    vec3 cam_z = vec3(cos(cam_theta), sin(cam_theta), 0.0);
    vec3 cam_x = vec3(cam_z.y, -cam_z.x, 0.0);
    vec3 cam_y, cam_pos;

    cam_z = cos(cam_phi)*cam_z + vec3(0,0,sin(cam_phi));
    cam_y = cross(cam_x, cam_z);
    cam_pos = -cam_z * cam_dist + camera_target;

    const float FOV_MULT = 3.0;

    // ray location on image surface after applying tent filter
    vec2 ccd_pos = get_ccd_pos(gl_FragCoord.xy);
    vec3 ray = normalize(ccd_pos.x*cam_x + ccd_pos.y*cam_y + FOV_MULT*cam_z);
    vec3 ray_pos = cam_pos;

    vec3 ray_color = vec3(1.0, 1.0, 1.0)*10.0;
    int prev_object = OBJ_NONE;

    vec3 cur_color = vec3(0.0, 0.0, 0.0);

    int bounce;
    for (bounce = 0; bounce <= N_BOUNCES; ++bounce) {

        // find intersection
        int which_object = OBJ_NONE;
        vec4 intersection; // vec4(normal.xyz, distance)
        vec4 cur_isec;
        vec3 isec_normal;
        vec3 diffuse = vec3(0.0, 0.0, 0.0);
        vec3 emission = vec3(0.0, 0.0, 0.0);

        if (prev_object != OBJ_SPHERE) {
            cur_isec = sphere_intersection(ray_pos, ray, sphere_pos, sphere_r);
            if (cur_isec.w > 0.0) {
                intersection = cur_isec;
                which_object = OBJ_SPHERE;
                diffuse = sphere_diffuse;
            }
        }

        if (prev_object != OBJ_PLANE) {
            cur_isec = plane_intersection(ray_pos, ray, plane_normal, plane_h);
            if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
                intersection = cur_isec;
                which_object = OBJ_PLANE;
                diffuse = plane_diffuse;
            }
        }

        if (prev_object != OBJ_LIGHT) {
            cur_isec = sphere_intersection(ray_pos, ray, light_pos, light_r);
            if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
                intersection = cur_isec;
                which_object = OBJ_LIGHT;
                emission = light_emission;
            }
        }

        cur_color += ray_color * emission;

        if (which_object == OBJ_NONE) {
            ray_color = vec3(0.0, 0.0, 0.0);
        } else {
            prev_object = which_object;
            vec3 normal = intersection.xyz;
            ray_pos += intersection.w * ray;

            // sample a new direction
            if (bounce == 0) ray = random_direction_1;
            else ray = random_direction_2;

            ray = normalize(ray);
            if (dot(ray, normal) < 0.0) ray = -ray;
            ray_color *= dot(normal, ray) * diffuse;
        }
    }

    vec3 base_color = texture2D(base_image, gl_FragCoord.xy / resolution.xy).xyz;
    gl_FragColor = vec4(base_color + cur_color, 1.0);
}
