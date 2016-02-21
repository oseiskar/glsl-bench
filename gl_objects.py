"""
Simple OO wrappers for the relevant OpenGL concepts
"""

import json
import numpy
from contextlib import contextmanager

from OpenGL.GL import *
from OpenGL.GLU import *

from gl_boilerplate import compile_fragment_shader_only

def read_file(filename):
    with open(filename) as f:
        return f.read()

def guess_gl_postfix(value):
    vals = numpy.ravel(value)
    count = len(vals)
    proto_value = vals[0]

    if isinstance(proto_value, int):
        letter = 'i'
    else:
        letter = 'f'

    return '%d%s' % (count, letter)

def auto_gl_func(prefix, value):
    name = prefix + guess_gl_postfix(value)
    return globals()[name]

def auto_gl_call(prefix, value, before_args=[], after_args=[]):
    args = list(before_args) + list(numpy.ravel(value)) + list(after_args)
    auto_gl_func(prefix, value)(*args)

class Shader:
    @staticmethod
    def new_from_file(json_path):
        return Shader(json.loads(read_file(json_path)))

    def __init__(self, json_data):
        self.resolution = json_data['resolution']
        self.uniforms = json_data['uniforms']

        self._add_built_in_uniforms()
        self._source = read_file(json_data['source_path'])

        self._texture_units = {}

    @property
    def aspect_ratio(self):
        return self.resolution[0] / float(self.resolution[1])

    def build(self):
        self._build_program()
        self._find_uniforms()

    def _add_built_in_uniforms(self):
        self.uniforms['resolution'] = self.resolution
        self.uniforms['base_image'] = None

    def _build_program(self):
        self._gl_handle = compile_fragment_shader_only(self._source)

    def _find_uniforms(self):
        self._uniform_handles = { \
            name: glGetUniformLocation(self._gl_handle, str(name)) \
                for name in self.uniforms.keys() }

    # these implement the "with shader as ..." statement
    @contextmanager
    def use_program(self):
        glUseProgram(self._gl_handle)
        yield
        glUseProgram(0)

    def _set_uniform(self, name, value):
        handle = self._uniform_handles.get(name)
        auto_gl_call('glUniform', value, before_args=[handle])

    def _assign_texture(self, name):
        if name not in self._texture_units:
            new_unit = len(self._texture_units)
            self._texture_units[name] = new_unit
            #print 'associated', name, 'with GL texture unit', new_unit
        return self._texture_units[name]

    def set_textures(self, **kwargs):
        for name, value in kwargs.items():
            gl_texture_unit = self._assign_texture(name)
            glActiveTexture(GL_TEXTURE0 + gl_texture_unit)
            if isinstance(value, Texture): value = value._gl_handle
            glBindTexture(GL_TEXTURE_2D, value)
            glUniform1i(self._uniform_handles.get(name), gl_texture_unit)

    def set_uniforms(self, **kwargs):
        for name, value in kwargs.items():
            self._set_uniform(name, value)

        self._set_uniform('resolution', [float(x) for x in self.resolution])

class Texture:
    def __init__(self, w=None, h=None, content=None, format=GL_RGB,
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

        self.w = w
        self.h = h
        self._gl_handle = glGenTextures(1)

        with self.bind():
            glTexParameterf( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, texture_wrap);
            glTexParameterf( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, texture_wrap);
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, interpolation)
            glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, interpolation)

            glTexImage2D(GL_TEXTURE_2D,0,internal_format,w,h,0,format,type,content)

    @contextmanager
    def bind(self):
        glBindTexture( GL_TEXTURE_2D, self._gl_handle )
        yield
        glBindTexture( GL_TEXTURE_2D, 0 )

class Framebuffer:

    def __init__(self, w, h):
        self.w = w
        self.h = h
        self._gl_handle = glGenFramebuffers(1)

    @contextmanager
    def _bind(self):
        glBindFramebuffer(GL_FRAMEBUFFER, self._gl_handle)
        glPushAttrib(GL_VIEWPORT_BIT)
        glViewport(0, 0, self.w, self.h)
        yield
        glPopAttrib()
        glBindFramebuffer(GL_FRAMEBUFFER, 0)

    @contextmanager
    def render_to_texture(self, texture):
        with self._bind():
            if isinstance(texture, Texture): texture = texture._gl_handle
            glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texture, 0)
            yield

    def read(self):
        with self._bind():
            texture_data = glReadPixels(0, 0, self.w, self.h, GL_RGB, GL_FLOAT)
            texture_data = numpy.reshape(texture_data, (self.h, self.w, 3))
            texture_data = texture_data[::-1,:,:]
            return texture_data
