#include "scene"
#include "rand"

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

vec3 get_random_cosine_weighted(vec3 normal, inout rand_state rng) {
    // cosine weighted
    vec3 dir = rand_next_gauss3(rng);
    // project to surface
    dir = normalize(dir - dot(dir, normal)*normal);
    float r = rand_next_uniform(rng);
    return normal * sqrt(1.0 - r) + dir * sqrt(r);rand_state
}

vec3 trace(vec2 xy, vec2 resolution) {
    rand_state rng;
    rand_init(rng);

    vec3 ray_pos, ray;
    get_camera_ray(xy, resolution, ray_pos, ray, rng);
    vec3 ray_color = vec3(1.0, 1.0, 1.0);

    const int OBJ_NONE = 0;
    const vec3 ZERO_VEC3 = vec3(0.0, 0.0, 0.0);
    int prev_object = OBJ_NONE;
    int inside_object = OBJ_NONE;
    vec3 cur_color = ZERO_VEC3;

    const int N_BOUNCES = 4;

    float choice_sample = rand_next_uniform(rng);

    for (int bounce = 0; bounce <= N_BOUNCES; ++bounce) {
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
                cur_color += ray_color * emission;
            }

            if (which_object == inside_object) {
                normal = -normal;
            }

            if (random_choice(get_reflectivity(which_object), choice_sample)) {
                // full reflection
                ray = ray - 2.0*dot(normal, ray)*normal;
            } else if (random_choice(get_transparency(which_object), choice_sample)) {
                // refraction
                float eta = 1.0 / get_ior(which_object);

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
                ray_color *= get_diffuse(which_object);
            }
            prev_object = which_object;
        }
    }
    return cur_color;
}
