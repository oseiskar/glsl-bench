
#define M_PI 3.14159265358979323846
#define DEG2RAD(x) ((x)/180.0*M_PI)

uniform vec2 resolution;
uniform vec2 tent_filter;
uniform vec3 random_direction_1, random_direction_2, random_direction_3;
uniform vec3 light_sample;
uniform float light_selection, reflection_selection;
uniform float frame_number;

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

// tracer parameters
#define N_BOUNCES 3
#define IMAGE_BRIGHTNESS 100.0

// secene geometry
#define OBJ_NONE 0
#define OBJ_SPHERE_1 1
#define OBJ_SPHERE_2 2
#define OBJ_BOX 3
#define OBJ_LIGHT_1 4
#define OBJ_LIGHT_2 5
#define N_OBJECTS 6

#define N_LIGHTS 2

#define ROOM_H 2.0
#define ROOM_W 5.0

#define sphere_1_pos vec3(0.0, 0.0, 0.5)
#define sphere_1_r 0.5
#define sphere_2_pos vec3(-1.1, 0.3, 0.25)
#define sphere_2_r 0.25

#define BOX_SIZE (vec3(ROOM_W, ROOM_W, ROOM_H)*0.5)
#define BOX_CENTER vec3(0.0, 0.0, ROOM_H*0.5)

#define light_r 0.4

#define light_1_pos vec3(-ROOM_W*0.5, 0.0, ROOM_H)
#define light_2_pos vec3(0.0, ROOM_W*0.5, ROOM_H)

// materials
#define light_1_emission vec3(0.8, 0.8, 1.0)
#define light_2_emission vec3(1.0, 0.8, 0.6)

#define sphere_1_diffuse vec3(.5, .8, .9)
#define box_diffuse vec3(1., 1., 1.)*.7

// helpers
#define UNIT_SPHERE_AREA (4.0*M_PI)
#define ZERO_VEC3 vec3(0.0, 0.0, 0.0)

int find_intersection(vec3 ray_pos, vec3 ray, int prev_object, out vec4 intersection) {
    int which_object = OBJ_NONE;
    vec4 cur_isec;

    if (prev_object != OBJ_SPHERE_1) {
        cur_isec = sphere_intersection(ray_pos, ray, sphere_1_pos, sphere_1_r);
        if (cur_isec.w > 0.0) {
            intersection = cur_isec;
            which_object = OBJ_SPHERE_1;
        }
    }

    if (prev_object != OBJ_SPHERE_2) {
        cur_isec = sphere_intersection(ray_pos, ray, sphere_2_pos, sphere_2_r);
        if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
            intersection = cur_isec;
            which_object = OBJ_SPHERE_2;
        }
    }

    // the box interior is non-convex and can handle that
    cur_isec = box_interior_intersection(ray_pos, ray, BOX_SIZE, BOX_CENTER);
    if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
        intersection = cur_isec;
        which_object = OBJ_BOX;
    }

    if (prev_object != OBJ_LIGHT_1) {
        cur_isec = sphere_intersection(ray_pos, ray, light_1_pos, light_r);
        if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
            intersection = cur_isec;
            which_object = OBJ_LIGHT_1;
        }
    }

    if (prev_object != OBJ_LIGHT_2) {
        cur_isec = sphere_intersection(ray_pos, ray, light_2_pos, light_r);
        if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
            intersection = cur_isec;
            which_object = OBJ_LIGHT_2;
        }
    }

    return which_object;
}

int select_light(out vec3 light_point, out float sample_prob_density_per_area) {
      light_point = normalize(light_sample) * light_r;
      sample_prob_density_per_area = 1.0 / (UNIT_SPHERE_AREA*light_r*light_r * float(N_LIGHTS));

      int light_object = OBJ_NONE;
      if (light_selection > 0.5) {
        light_point += light_1_pos;
        light_object = OBJ_LIGHT_1;
      } else {
        light_point += light_2_pos;
        light_object = OBJ_LIGHT_2;
      }

      return light_object;
}

bool get_emission(int which_obj, out vec3 emission) {
  if (which_obj == OBJ_LIGHT_1) {
    emission = light_1_emission;
  } else if (which_obj == OBJ_LIGHT_2) {
    emission = light_2_emission;
  } else {
    emission = ZERO_VEC3;
    return false;
  }
  return true;
}

vec3 get_diffuse(int which_object) {
  if (which_object == OBJ_SPHERE_1 || which_object == OBJ_SPHERE_2) {
    return sphere_1_diffuse;
  } else if (which_object == OBJ_BOX) {
    return box_diffuse;
  } else {
    return ZERO_VEC3;
  }
}

float get_reflectivity(int which_object) {
  if (which_object == OBJ_SPHERE_2) {
    return 1.0;
  } else {
    return 0.0;
  }
}

float weight1(float p1, float p2) {
    //return 0.5;
    return p1 / (p1 + p2); // balance heuristic
    //return p1*p1 / (p1*p1 + p2*p2); // power heuristic (2)
    //return p1 > p2 ? 1.0 : 0.0; // maximum heuristic
}

#define weight2 weight1

// uncomment to use pure path tracing
//#define weight1(a,b) 1.0
//#define weight2(a,b) 0.0

void main() {
    // define camera
    const float fov_angle = DEG2RAD(50.0);
    const float cam_theta = DEG2RAD(300.0);
    const float cam_phi = DEG2RAD(5.0);
    const float cam_dist = 2.6;
    vec3 camera_target = vec3(-0.5, 0.0, 0.35);

    vec3 cam_z = vec3(cos(cam_theta), sin(cam_theta), 0.0);
    vec3 cam_x = vec3(cam_z.y, -cam_z.x, 0.0);
    vec3 cam_y, cam_pos;

    cam_z = cos(cam_phi)*cam_z + vec3(0,0,-sin(cam_phi));
    cam_y = cross(cam_x, cam_z);
    cam_pos = -cam_z * cam_dist + camera_target;

    vec3 light_point;
    float light_sample_area_probability;
    vec3 light_emission;
    int light_object = select_light(light_point, light_sample_area_probability);
    get_emission(light_object, light_emission);

    // ray location on image surface after applying tent filter
    vec2 ccd_pos = get_ccd_pos(gl_FragCoord.xy);
    vec3 ray = normalize(ccd_pos.x*cam_x + ccd_pos.y*cam_y + 1.0/tan(fov_angle*0.5)*cam_z);
    vec3 ray_pos = cam_pos;

    vec3 ray_color = vec3(1.0, 1.0, 1.0) * IMAGE_BRIGHTNESS;
    int prev_object = OBJ_NONE;

    vec3 cur_color = ZERO_VEC3;
    bool was_diffuse = false;
    float ray_type_sample = reflection_selection;

    for (int bounce = 0; bounce <= N_BOUNCES; ++bounce)  {

        // find intersection
        vec4 intersection; // vec4(normal.xyz, distance)

        int which_object = find_intersection(ray_pos, ray, prev_object, intersection);

        if (which_object == OBJ_NONE) {
            ray_color = ZERO_VEC3;
        } else {

            vec3 normal = intersection.xyz;
            ray_pos += intersection.w * ray;

            vec3 emission = ZERO_VEC3;
            if (get_emission(which_object, emission)) {
                float invDist2 = 1.0 / (intersection.w*intersection.w);
                float probThis = 2.0 * invDist2 / UNIT_SPHERE_AREA * -dot(normal, ray);
                float probOther = light_sample_area_probability;

                if (!was_diffuse) {
                    probOther = 0.0;
                    probThis = 1.0;
                }

                cur_color += ray_color * emission * weight1(probThis, probOther);
            }

            // visibility test
            vec4 shadow_isec;
            vec3 shadow_ray = light_point - ray_pos;
            float shadow_dist = length(shadow_ray);
            shadow_ray = normalize(shadow_ray);

            int shadow_object = which_object;
            if (which_object != light_object && dot(shadow_ray, normal) > 0.0) {
                shadow_object = find_intersection(ray_pos, shadow_ray, which_object, shadow_isec);
            }
            else {
              shadow_isec.w = -1.0;
              shadow_object = N_OBJECTS;
            }

            float directionCoeff = 0.0;
            float reflectivity = get_reflectivity(which_object);
            if (ray_type_sample < reflectivity) {
                ray_type_sample /= reflectivity;

                // full reflection
                ray = ray - 2.0*dot(normal, ray)*normal;
                directionCoeff = 1.0;
                was_diffuse = false;
            } else {
                ray_type_sample -= reflectivity;
                ray_type_sample /= 1.0 - reflectivity;

                // diffuse reflection
                // sample a new direction
                vec3 rand_dir;
                if (bounce == 0) rand_dir = random_direction_1;
                if (bounce == 1) rand_dir = random_direction_2;
                else rand_dir = random_direction_3;

                ray = normalize(rand_dir);
                if (dot(ray, normal) < 0.0) ray = -ray;
                directionCoeff = dot(normal, ray);

                ray_color *= get_diffuse(which_object);
                was_diffuse = true;
            }

            if (bounce < N_BOUNCES && was_diffuse && (
                  shadow_object == OBJ_NONE ||
                  (shadow_object == light_object && dot(shadow_isec.xyz, shadow_ray) < 0.0) ||
                  shadow_isec.w > shadow_dist)) {

                // not obstructed

                float invShadowDist2 = 1.0 / (shadow_dist*shadow_dist);
                float contribTerm =  -dot(shadow_isec.xyz, shadow_ray) * invShadowDist2 * 2.0 / UNIT_SPHERE_AREA;
                float probOther = contribTerm;
                float intensity = dot(normal, shadow_ray) * contribTerm;

                // multiple importance sampling probabilities of different strategies
                float probThis = light_sample_area_probability;

                cur_color += ray_color * light_emission * intensity * weight2(probThis, probOther);
            }

            ray_color *= directionCoeff;
            prev_object = which_object;
        }
    }

    vec3 base_color = texture2D(base_image, gl_FragCoord.xy / resolution.xy).xyz;
    gl_FragColor = vec4((base_color * frame_number + cur_color)/(frame_number+1.0), 1.0);
}
