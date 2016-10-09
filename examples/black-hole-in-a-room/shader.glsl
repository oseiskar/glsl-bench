
#define M_PI 3.14159265358979323846
#define DEG2RAD(x) ((x)/180.0*M_PI)

uniform vec2 resolution;
uniform vec2 tent_filter;
uniform vec3 random_direction_1, random_direction_2, random_direction_3;

uniform sampler2D base_image;

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

vec4 box_interior_intersection(vec3 pos, vec3 ray, vec3 box_size, vec3 box_center) {
    vec3 corner = box_size*sign(ray) + box_center;
    vec3 diff = pos - corner;
    vec3 dists = -diff / ray;

    vec3 normal = vec3(0.0, 0.0, 1.0);
    float dist = min(dists.x, min(dists.y, dists.z));

    if (dist == dists.x) normal = vec3(1.0, 0.0, 0.0);
    else if (dist == dists.y) normal = vec3(0.0, 1.0, 0.0);

    normal = normal * -sign(ray);
    return vec4(normal, dist);
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
#define OBJ_SPHERE_1 1
#define OBJ_SPHERE_2 2
#define OBJ_BOX 3
#define OBJ_LIGHT_1 4
#define OBJ_LIGHT_2 5

#define REFLECTIVE_OBJECT OBJ_SPHERE_2

#define N_BOUNCES 2

#define IMAGE_BRIGHTNESS 60.0
#define ROOM_H 2.0
#define ROOM_W 5.0

// black hole params
#define NSTEPS 50
#define MAX_REVOLUTIONS 2.0
#define BLACK_HOLE_RADIUS 0.2
const vec3 black_hole_pos = vec3(-1.0, 0.0, 0.4);

void main() {

    // scene geometry
    const vec3 light_1_pos = vec3(-ROOM_W*0.5, 0.0, ROOM_H);
    const vec3 light_2_pos = vec3(0.0, ROOM_W*0.5, ROOM_H);
    const float light_r = 0.4;
    const vec3 light_1_emission = vec3(0.8, 0.8, 1.0);
    const vec3 light_2_emission = vec3(1.0, 0.8, 0.6);

    const vec3 sphere_1_pos = vec3(0.0, -1.0, 0.4);
    const float sphere_1_r = 0.4;
    const vec3 sphere_1_diffuse = vec3(.5, .8, .9);

    const vec3 box_size = vec3(ROOM_W, ROOM_W, ROOM_H)*0.5;
    const vec3 box_diffuse = vec3(1., 1., 1.)*.7;
    const vec3 box_center = vec3(0.0, 0.0, ROOM_H*0.5);

    // define camera
    const float fov_angle = DEG2RAD(70.0);
    const float cam_theta = DEG2RAD(20.0);
    const float cam_phi = DEG2RAD(5.0);
    const float cam_dist = 2.2;
    vec3 camera_target = black_hole_pos;

    vec3 cam_z = vec3(cos(cam_theta), sin(cam_theta), 0.0);
    vec3 cam_x = vec3(cam_z.y, -cam_z.x, 0.0);
    vec3 cam_y, cam_pos;

    cam_z = cos(cam_phi)*cam_z + vec3(0,0,-sin(cam_phi));
    cam_y = cross(cam_x, cam_z);
    cam_pos = -cam_z * cam_dist + camera_target;

    // ray location on image surface after applying tent filter
    vec2 ccd_pos = get_ccd_pos(gl_FragCoord.xy);
    vec3 ray = normalize(ccd_pos.x*cam_x + ccd_pos.y*cam_y + 1.0/tan(fov_angle*0.5)*cam_z);
    vec3 pos = cam_pos;

    vec3 ray_color = vec3(1.0, 1.0, 1.0) * IMAGE_BRIGHTNESS;
    int prev_object = OBJ_NONE;

    vec3 cur_color = vec3(0.0, 0.0, 0.0);

    int bounce;
    for (bounce = 0; bounce <= N_BOUNCES; ++bounce) {

        // black hole
        float step = 0.01;

        vec3 old_pos = pos;

        // initial conditions
        pos = (pos - black_hole_pos) / BLACK_HOLE_RADIUS;

        float u = 1.0 / length(pos), old_u;
        float u0 = u;

        vec3 normal_vec = normalize(pos);
        vec3 tangent_vec = normalize(cross(cross(normal_vec, ray), normal_vec));

        float du = -dot(ray,normal_vec) / dot(ray,tangent_vec) * u;
        float du0 = du;

        float phi = 0.0;

        for (int j=0; j < NSTEPS; j++) {

            step = MAX_REVOLUTIONS * 2.0*M_PI / float(NSTEPS);

            // adaptive step size, some ad hoc formulas
            float max_rel_u_change = (1.0-log(u))*10.0 / float(NSTEPS);
            if ((du > 0.0 || (du0 < 0.0 && u0/u < 5.0)) && abs(du) > abs(max_rel_u_change*u) / step)
                step = max_rel_u_change*u/abs(du);

            old_u = u;

            // Leapfrog scheme
            u += du*step;
            float ddu = -u*(1.0 - 1.5*u*u);
            du += ddu*step;

            float ray_l = 100.0;

            if (u > 0.0) {

                phi += step;

                pos = (cos(phi)*normal_vec + sin(phi)*tangent_vec) / u * BLACK_HOLE_RADIUS + black_hole_pos;

                ray = pos-old_pos;
                ray_l = length(ray);
                ray = ray / ray_l;
            }
            // else ray "escapes"

            // --------- intersections

            int which_object = OBJ_NONE;
            vec4 intersection; // vec4(normal.xyz, distance)
            vec4 cur_isec;
            vec3 isec_normal;
            vec3 diffuse = vec3(0.0, 0.0, 0.0);
            vec3 emission = vec3(0.0, 0.0, 0.0);

            if (prev_object != OBJ_SPHERE_1) {
                cur_isec = sphere_intersection(old_pos, ray, sphere_1_pos, sphere_1_r);
                if (cur_isec.w > 0.0 && cur_isec.w < ray_l) {
                    intersection = cur_isec;
                    which_object = OBJ_SPHERE_1;
                    diffuse = sphere_1_diffuse;
                }
            }

            // the box interior is non-convex and can handle that
            cur_isec = box_interior_intersection(old_pos, ray, box_size, box_center);
            if (cur_isec.w > 0.0 && cur_isec.w < ray_l && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
                intersection = cur_isec;
                which_object = OBJ_BOX;
                diffuse = box_diffuse;
            }

            if (prev_object != OBJ_LIGHT_1) {
                cur_isec = sphere_intersection(old_pos, ray, light_1_pos, light_r);
                if (cur_isec.w > 0.0 && cur_isec.w < ray_l && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
                    intersection = cur_isec;
                    which_object = OBJ_LIGHT_1;
                    emission = light_1_emission;
                }
            }

            if (prev_object != OBJ_LIGHT_2) {
                cur_isec = sphere_intersection(old_pos, ray, light_2_pos, light_r);
                if (cur_isec.w > 0.0 && cur_isec.w < ray_l && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
                    intersection = cur_isec;
                    which_object = OBJ_LIGHT_2;
                    emission = light_2_emission;
                }
            }

            cur_color += ray_color * emission;

            if (which_object != OBJ_NONE) {
                prev_object = which_object;
                vec3 normal = intersection.xyz;
                pos = old_pos + intersection.w * ray;

                if (which_object == REFLECTIVE_OBJECT) {
                    // full reflection
                    ray = ray - 2.0*dot(normal, ray)*normal;
                } else {
                    // sample a new direction
                    vec3 rand_dir;
                    if (bounce == 0) rand_dir = random_direction_1;
                    if (bounce == 1) rand_dir = random_direction_2;
                    else rand_dir = random_direction_3;

                    ray = normalize(rand_dir);
                    if (dot(ray, normal) < 0.0) ray = -ray;
                    ray_color *= dot(normal, ray) * diffuse;
                }

                break;
            }

            old_pos = pos;
        }

        // the event horizon is at u = 1
        if (u > 1.0) break;
    }

    vec3 base_color = texture2D(base_image, gl_FragCoord.xy / resolution.xy).xyz;
    gl_FragColor = vec4(base_color + cur_color, 1.0);
}
