import ctypes
import sys

import numpy

from OpenGL.GL import *
from OpenGL.GLU import *

class ShaderCompilationError(Exception):
    pass

def compile_shader(source, shader_type):
    shader = glCreateShader(shader_type)
    glShaderSource(shader, source)
    glCompileShader(shader)

    status = ctypes.c_int()
    glGetShaderiv(shader, GL_COMPILE_STATUS, ctypes.byref(status))
    if not status.value:
        length = ctypes.c_int()
        glGetShaderiv(shader, GL_INFO_LOG_LENGTH, ctypes.byref(length))
        if length.value > 0:
            error_message = glGetShaderInfoLog(shader)
        else:
            error_message = ''

        glDeleteShader(shader)
        raise ShaderCompilationError(error_message)
    return shader

def compile_program(vertex_source, fragment_source):
    vertex_shader = None
    fragment_shader = None
    program = glCreateProgram()

    if vertex_source:
        vertex_shader = compile_shader(vertex_source, GL_VERTEX_SHADER)
        glAttachShader(program, vertex_shader)
    if fragment_source:
        fragment_shader = compile_shader(fragment_source, GL_FRAGMENT_SHADER)
        glAttachShader(program, fragment_shader)

    glLinkProgram(program)

    if vertex_shader:
        glDeleteShader(vertex_shader)
    if fragment_shader:
        glDeleteShader(fragment_shader)

    return program

def texture_rect(aspect, brightness=None):
    glBegin(GL_QUADS)
    if brightness is not None:
        glColor3f(brightness, brightness, brightness)
    glTexCoord2f(0,0)
    glVertex3f(-aspect,-1, 0)
    glTexCoord2f(1,0)
    glVertex3f( aspect,-1, 0)
    glTexCoord2f(1,1)
    glVertex3f( aspect, 1, 0)
    glTexCoord2f(0,1)
    glVertex3f(-aspect, 1, 0)
    glEnd()

PASSTHROUGH_VERTEX_SHADER = '''
    varying vec3 pos;
    void main() {
        pos = gl_Vertex.xyz;
        gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;
    }
'''

def compile_fragment_shader_only(source):
    return compile_program(PASSTHROUGH_VERTEX_SHADER, source)

def guess_gl_postfix(value):
    vals = numpy.ravel(value)
    count = len(vals)
    proto_value = vals[0]

    if isinstance(proto_value, int):
        letter = 'i'
    else:
        letter = 'f'

    return '%d%s' % (count, letter)

def auto_gl_call(prefix, value, before_args=[], after_args=[]):
    args = list(before_args) + list(numpy.ravel(value)) + list(after_args)

    func_name = prefix + guess_gl_postfix(value)
    func = globals()[func_name]

    try:
        func(*args)
    except ctypes.ArgumentError as err:
        raise RuntimeError("Failed to call %s with args %s: %s" % \
            (func_name, str(args), str(err)))
