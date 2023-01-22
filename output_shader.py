"""
Shader for rendering output to screen (or frame buffer)
"""

from contextlib import contextmanager
from gl_objects import Shader

def finalFragCoord(flipY = False):
    if flipY:
        return 'vec2(gl_FragCoord.x/resolution.x, 1.0 - gl_FragCoord.y/resolution.y)'
    return 'gl_FragCoord.xy / resolution.xy'

def formatResolution(resolution):
    return "const vec2 resolution = vec2(float(%s), float(%s))" % (resolution[0], resolution[1])

def buildCopyFragmentShader(resolution, flipY = False):
    return """
    uniform sampler2D source;
    void main() {
        %s;
        gl_FragColor = texture2D(source, %s);
    }""" % (formatResolution(resolution), finalFragCoord(flipY))


def buildGammaCorrectionFragmentShader(resolution, flipY = False, gamma = "1.0"):
    return """
    uniform sampler2D source;
    void main() {
        %s;
        vec4 src = texture2D(source, %s);
        gl_FragColor = vec4(pow(src.xyz, vec3(1,1,1) / float(%s)), src.w);
    }""" % (formatResolution(resolution), finalFragCoord(flipY), gamma)


def buildSRGBFragmentShader(resolution, flipY = False):
    return """
    uniform sampler2D source;
    void main() {
        %s;
        // https://gamedev.stackexchange.com/a/148088
        vec4 src = texture2D(source, %s);
        vec3 cutoff = vec3(lessThan(src.xyz, vec3(0.0031308)));
        vec3 higher = vec3(1.055)*pow(src.xyz, vec3(1.0/2.4)) - vec3(0.055);
        vec3 lower = src.xyz * vec3(12.92);
        gl_FragColor = vec4(higher * (vec3(1.0) - cutoff) + lower * cutoff, src.w);
    }
    """ %  (formatResolution(resolution), finalFragCoord(flipY))

def try_parse_float(f):
    try:
        return float(f)
    except:
        return None

class OutputShader():
    def __init__(self, resolution, gamma, flip_y):
        if gamma is not None and gamma.upper() == 'SRGB':
            source = buildSRGBFragmentShader(resolution, flip_y)
        elif gamma is None or try_parse_float(gamma) == 1.0:
            source = buildCopyFragmentShader(resolution, flip_y)
        else:
            source = buildGammaCorrectionFragmentShader(resolution, flip_y, float(gamma))

        self.shader = Shader(resolution, source, uniforms = { 'source': 0 })
        self.shader.build()

    @contextmanager
    def use_program(self, source_texture_id, texture_unit = 0):
        from OpenGL.GL import glActiveTexture, glBindTexture, glUniform1i, \
            GL_TEXTURE0, GL_TEXTURE_2D

        uniform_handle = self.shader.get_uniform_handle('source')

        with self.shader.use_program():
            glActiveTexture(GL_TEXTURE0 + texture_unit)
            glBindTexture(GL_TEXTURE_2D, source_texture_id)

            glUniform1i(uniform_handle, texture_unit)
            # it seems that this unit should be activated before using
            # the framebuffer
            glActiveTexture(GL_TEXTURE0)
            yield
            glBindTexture(GL_TEXTURE_2D, 0)
