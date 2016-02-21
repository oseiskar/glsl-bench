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

def create_texture(w=None, h=None, content=None, format=GL_RGB,
        type=GL_FLOAT, interpolation=GL_LINEAR, texture_wrap=GL_REPEAT,
        internal_format=None):

    # note: internal format needs to be GL_RGB32F to have float textures
    if internal_format is None:
        internal_format = format

    if content is not None:
        if isinstance(content, float):
            content = numpy.zeros((h,w,3))
        assert(w is None or w == content.shape[1])
        assert(h is None or h == content.shape[0])
        w = content.shape[1]
        h = content.shape[0]

    texture = glGenTextures(1)
    glBindTexture( GL_TEXTURE_2D, texture )
    glTexParameterf( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, texture_wrap);
    glTexParameterf( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, texture_wrap);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, interpolation)
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, interpolation)

    glTexImage2D(GL_TEXTURE_2D,0,internal_format,w,h,0,format,type,content)

    glBindTexture( GL_TEXTURE_2D, 0 )
    return texture

PASSTHROUGH_VERTEX_SHADER = '''
    varying vec3 pos;
    void main() {
        pos = gl_Vertex.xyz;
        gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;
    }
'''
