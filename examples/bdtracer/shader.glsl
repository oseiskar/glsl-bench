
#define M_PI 3.14159265358979323846
#define DEG2RAD(x) ((x)/180.0*M_PI)

uniform vec2 resolution;
uniform vec2 tent_filter;
uniform vec4 random_gauss_1, random_gauss_2, random_gauss_3,
             random_gauss_4, random_gauss_5, random_gauss_6,
             random_gauss_7, random_gauss_8;
uniform vec4 random_uniforms_1, random_uniforms_2, random_uniforms_3,
             random_uniforms_4, random_uniforms_5, random_uniforms_6,
             random_uniforms_7, random_uniforms_8;
uniform vec3 light_sample;
uniform float random_choice_sample;
uniform float frame_number;

uniform sampler2D base_image;

#define SQ(x) ((x)*(x))
#define NO_INTERSECTION vec4(0.0, 0.0, 0.0, -1.0)

vec4 sphere_intersection(vec3 pos, vec3 ray, vec3 sphere_pos, float sphere_r, bool is_inside) {

    // ray-sphere intersection
    vec3 d = pos - sphere_pos;

    float dotp = dot(d,ray);
    float c_coeff = dot(d,d) - SQ(sphere_r);
    float ray2 = dot(ray, ray);
    float discr = dotp*dotp - ray2*c_coeff;

    if (discr < 0.0) return NO_INTERSECTION;

    float sqrt_discr = sqrt(discr);
    float dist = -dotp - sqrt_discr;
    if (is_inside) {
      dist += sqrt_discr*2.0;
    }
    dist /= ray2;
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
#define N_BOUNCES 4
#define IMAGE_BRIGHTNESS 1.0

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
#define light_1_emission vec3(0.8, 0.8, 1.0)*100.0;
#define light_2_emission vec3(1.0, 0.8, 0.6)*100.0;

#define sphere_1_diffuse vec3(.5, .8, .9)
#define box_diffuse vec3(1., 1., 1.)*.7

// helpers
#define UNIT_SPHERE_AREA (4.0*M_PI)
#define ZERO_VEC3 vec3(0.0, 0.0, 0.0)

// assuming x is random uniform in [0,1], return x < prob and make
// x a new random uniform in [0, 1] independent of this choice
bool random_choice(float prob, inout float x) {
    if (x < prob) {
      x /= prob;
      return true;
    } else {
      x = (x - prob) / (1.0 - prob);
      return false;
    }
}

int find_intersection(vec3 ray_pos, vec3 ray, int prev_object, int inside_object, out vec4 intersection) {
    int which_object = OBJ_NONE;
    vec4 cur_isec;
    bool inside;

    inside = inside_object == OBJ_SPHERE_1;
    if (inside || prev_object != OBJ_SPHERE_1) {
        cur_isec = sphere_intersection(ray_pos, ray, sphere_1_pos, sphere_1_r, inside);
        if (cur_isec.w > 0.0) {
            intersection = cur_isec;
            which_object = OBJ_SPHERE_1;
        }
    }

    inside = inside_object == OBJ_SPHERE_2;
    if (inside || prev_object != OBJ_SPHERE_2) {
        cur_isec = sphere_intersection(ray_pos, ray, sphere_2_pos, sphere_2_r, inside);
        if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
            intersection = cur_isec;
            which_object = OBJ_SPHERE_2;
        }
    }

    // The box interior is non-convex and can handle that.
    // "Inside" not supported here
    cur_isec = box_interior_intersection(ray_pos, ray, BOX_SIZE, BOX_CENTER);
    if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
        intersection = cur_isec;
        which_object = OBJ_BOX;
    }

    inside = inside_object == OBJ_LIGHT_1;
    if (inside || prev_object != OBJ_LIGHT_1) {
        cur_isec = sphere_intersection(ray_pos, ray, light_1_pos, light_r, inside);
        if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
            intersection = cur_isec;
            which_object = OBJ_LIGHT_1;
        }
    }

    inside = inside_object == OBJ_LIGHT_2;
    if (inside || prev_object != OBJ_LIGHT_2) {
        cur_isec = sphere_intersection(ray_pos, ray, light_2_pos, light_r, inside);
        if (cur_isec.w > 0.0 && (cur_isec.w < intersection.w || which_object == OBJ_NONE)) {
            intersection = cur_isec;
            which_object = OBJ_LIGHT_2;
        }
    }

    return which_object;
}

int select_light(out vec3 light_point, out float sample_prob_density_per_area, inout float x) {
      light_point = normalize(light_sample) * light_r;
      sample_prob_density_per_area = 1.0 / (UNIT_SPHERE_AREA*light_r*light_r * float(N_LIGHTS));

      int light_object = OBJ_NONE;
      if (random_choice(0.5, x)) {
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
  emission *= 1.0 / (UNIT_SPHERE_AREA * light_r * light_r);
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
    return 0.1;
  } else {
    return 0.0;
  }
}

float get_transparency(int which_object) {
  if (which_object == OBJ_SPHERE_2) {
    return 1.0; // sampled after reflectivity
  }
  return 0.0;
}

// index of refraction
float get_ior(int which_object) {
  if (which_object == OBJ_SPHERE_2) {
    return 1.5;
  }
  return 1.0;
}

vec4 get_rand_gauss(int bounce) {
  if (bounce == 0) return random_gauss_1;
  if (bounce == 1) return random_gauss_2;
  if (bounce == 2) return random_gauss_3;
  if (bounce == 3) return random_gauss_4;
  if (bounce == 4) return random_gauss_5;
  if (bounce == 5) return random_gauss_6;
  if (bounce == 6) return random_gauss_7;
  if (bounce == 8) return random_gauss_8;
  else return vec4(0.0, 0.0, 0.0, 0.0);
}

vec4 get_rand_uniforms(int bounce) {
  if (bounce == 0) return random_uniforms_1;
  if (bounce == 1) return random_uniforms_2;
  if (bounce == 2) return random_uniforms_3;
  if (bounce == 3) return random_uniforms_4;
  if (bounce == 4) return random_uniforms_5;
  if (bounce == 5) return random_uniforms_6;
  if (bounce == 6) return random_uniforms_7;
  if (bounce == 8) return random_uniforms_8;
  else return vec4(0.0, 0.0, 0.0, 0.0);
}

vec3 get_random_cosine_weighted(vec3 normal, int bounce) {

  // uniform sampling
  //vec3 dir = normalize(get_rand_gauss(bounce).xyz);
  //if (dot(dir, normal) < 0.0) dir = -dir;
  //return dir;

  // cosine weighted
  vec3 dir = get_rand_gauss(bounce).xyz;
  // project to surface
  dir = normalize(dir - dot(dir, normal)*normal);
  float r = get_rand_uniforms(bounce).x;
  return normal * sqrt(1.0 - r) + dir * sqrt(r);
}

#if 1
float weight1(float p1, float p2) {
    //return 0.5;
    //return p1 / (p1 + p2); // balance heuristic
    return p1*p1 / (p1*p1 + p2*p2); // power heuristic (2)
    //return p1 > p2 ? 1.0 : 0.0; // maximum heuristic
}

#define weight2 weight1
#else
// uncomment to use pure path tracing
#define weight1(a,b) 1.0
#define weight2(a,b) 0.0
#endif

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
    float choice_sample = random_choice_sample;
    int light_object = select_light(light_point, light_sample_area_probability, choice_sample);
    get_emission(light_object, light_emission);
    light_emission *= N_LIGHTS;

    // ray location on image surface after applying tent filter
    vec2 ccd_pos = get_ccd_pos(gl_FragCoord.xy);
    vec3 ray = normalize(ccd_pos.x*cam_x + ccd_pos.y*cam_y + 1.0/tan(fov_angle*0.5)*cam_z);
    vec3 ray_pos = cam_pos;

    vec3 ray_color = vec3(1.0, 1.0, 1.0) * IMAGE_BRIGHTNESS;
    int prev_object = OBJ_NONE;
    int inside_object = OBJ_NONE;

    vec3 cur_color = ZERO_VEC3;
    bool was_diffuse = false;
    double lastCosineWeight = 0;

    for (int bounce = 0; bounce <= N_BOUNCES; ++bounce)  {

        // find intersection
        vec4 intersection; // vec4(normal.xyz, distance)

        int which_object = find_intersection(ray_pos, ray, prev_object, inside_object, intersection);

        if (which_object == OBJ_NONE) {
            ray_color = ZERO_VEC3;
        } else {
            vec3 normal = intersection.xyz;
            ray_pos += intersection.w * ray;

            vec3 emission = ZERO_VEC3;
            if (get_emission(which_object, emission)) {
                float changeOfVarsTerm = -dot(normal, ray) / (intersection.w*intersection.w);
                float probThis = changeOfVarsTerm * lastCosineWeight /  M_PI;
                float intensity = 1.0; // TODO: ?
                float probOther = light_sample_area_probability;

                if (!was_diffuse) {
                    probOther = 0.0;
                    probThis = 1.0;
                }

                cur_color += intensity * ray_color * emission * weight1(probThis, probOther);
            }

            // visibility test
            vec4 shadow_isec;
            vec3 shadow_ray = light_point - ray_pos;
            float shadow_dist = length(shadow_ray);
            shadow_ray = normalize(shadow_ray);

            int shadow_object = which_object;
            if (which_object != light_object &&
                inside_object == OBJ_NONE && // no lights inside transparent objects supported
                dot(shadow_ray, normal) > 0.0) {
                shadow_object = find_intersection(ray_pos, shadow_ray, which_object, inside_object, shadow_isec);
            }
            else {
              shadow_isec.w = -1.0;
              shadow_object = N_OBJECTS;
            }

            if (which_object == inside_object) {
                normal = -normal;
            }

            if (random_choice(get_reflectivity(which_object), choice_sample)) {
                // full reflection
                ray = ray - 2.0*dot(normal, ray)*normal;
                was_diffuse = false;
            } else if (random_choice(get_transparency(which_object), choice_sample)) {
                // refraction
                float eta = 1.0 / get_ior(which_object);

                was_diffuse = false;
                int next_object = which_object;

                // out
                if (inside_object == which_object) {
                    next_object = OBJ_NONE;
                    eta = 1.0 / eta;
                }

                // see https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/refract.xhtml
                // Snell's law for refraction
                float d = dot(normal, ray);
                float k = 1.0 - eta*eta * (1.0 - d*d);
                if (k < 0.0) {
                    // total reflection
                    ray = ray - 2.0*d*normal;
                } else {
                    inside_object = next_object;
                    ray = eta * ray - (eta * d + sqrt(k)) * normal;
                    normal = -normal;
                }
            } else {
                // diffuse reflection
                // sample a new direction
                ray = get_random_cosine_weighted(normal, bounce);
                lastCosineWeight = dot(normal, ray);

                ray_color *= get_diffuse(which_object) / M_PI;
                was_diffuse = true;
            }

            if (bounce < N_BOUNCES && was_diffuse && (
                  shadow_object == OBJ_NONE ||
                  (shadow_object == light_object && dot(shadow_isec.xyz, shadow_ray) < 0.0) ||
                  shadow_isec.w > shadow_dist)) {

                // not obstructed

                float invShadowDist2 = 1.0 / (shadow_dist*shadow_dist);
                float changeOfVarsTerm = -dot(shadow_isec.xyz, shadow_ray) * invShadowDist2;
                float probOther = changeOfVarsTerm * dot(normal, shadow_ray) / M_PI;

                // multiple importance sampling probabilities of different strategies
                float probThis = light_sample_area_probability;
                float intensity = dot(normal, shadow_ray) * changeOfVarsTerm / M_PI; // mystery M_PI

                cur_color += ray_color * light_emission * intensity * weight2(probThis, probOther);
            }

            prev_object = which_object;
        }
    }

    vec3 base_color = texture2D(base_image, gl_FragCoord.xy / resolution.xy).xyz;
    gl_FragColor = vec4((base_color * frame_number + cur_color)/(frame_number+1.0), 1.0);
}
