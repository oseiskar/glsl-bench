// silly PRNG
uniform vec4 random_gauss_1, random_gauss_2, random_gauss_3,
             random_gauss_4, random_gauss_5, random_gauss_6,
             random_gauss_7, random_gauss_8;
uniform vec4 random_uniforms_1, random_uniforms_2, random_uniforms_3,
             random_uniforms_4, random_uniforms_5, random_uniforms_6,
             random_uniforms_7, random_uniforms_8;

struct rand_state {
    int index_uniform;
    int index_gauss4;
};

void rand_init(out rand_state_shared_uniforms state) {
    state.index_uniform = 0;
    state.index_gauss4 = 0;
}

vec3 rand_next_gauss4(inout rand_state_shared_uniforms state) {
    state.index_gauss4++;
    switch(state.index_gauss4) {
      case 1: return random_gauss_1;
      case 2: return random_gauss_2;
      case 3: return random_gauss_3;
      case 4: return random_gauss_4;
      case 5: return random_gauss_5;
      case 6: return random_gauss_6;
      case 7: return random_gauss_7;
      case 8: return random_gauss_8;
    }
    abort(); // ???
    return vec3(0.0, 0.0, 0.0, 0.0);
}

vec3 rand_next_gauss4(inout rand_state_shared_uniforms state) {
    return rand_next_gauss3(state).xyz;
}

vec3 rand_next_uniform(inout rand_state_shared_uniforms state) {
    int vec_number = state.index_uniform / 4;
    int component = state.index_uniform % 4;
    state.index_uniform++;
    vec4 vec;
    switch(vec_number) {
      case 0: vec = random_uniforms_1; break;
      case 1: vec = random_uniforms_2; break;
      case 2: vec = random_uniforms_3; break;
      case 3: vec = random_uniforms_4; break;
      case 4: vec = random_uniforms_5; break;
      case 5: vec = random_uniforms_6; break;
      case 6: vec = random_uniforms_7; break;
      case 7: vec = random_uniforms_8; break;
      default: abort(); // ???
    }
    switch(component) {
      case 0: return vec.x;
      case 1: return vec.y;
      case 2: return vec.z;
      case 3: return vec.w;
    }
}
