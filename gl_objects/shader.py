"""
Fragment shader + trivial vertex shader
"""

import numpy
from contextlib import contextmanager

from OpenGL.GL import *

from gl_boilerplate import compile_fragment_shader_only, auto_gl_call
from texture import Texture

class Shader:
    def __init__(self, resolution, source, uniforms):
        self.resolution = resolution
        self.uniforms = uniforms
        self._source = source
        self._texture_units = {}

    @property
    def aspect_ratio(self):
        return self.resolution[0] / float(self.resolution[1])

    def build(self):
        self._build_program()
        self._find_uniforms()

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

    def _set_texture(self, name, value):
        gl_texture_unit = self._assign_texture(name)
        glActiveTexture(GL_TEXTURE0 + gl_texture_unit)
        glBindTexture(GL_TEXTURE_2D, value._gl_handle)
        glUniform1i(self._uniform_handles.get(name), gl_texture_unit)

    def _assign_texture(self, name):
        if name not in self._texture_units:
            new_unit = len(self._texture_units)
            self._texture_units[name] = new_unit
            #print 'associated', name, 'with GL texture unit', new_unit
        return self._texture_units[name]

    def set_uniforms(self, **kwargs):
        for name, value in kwargs.items():
            self.uniforms[name] = value

        for name, value in self.uniforms.items():
            if value is None: continue
            if isinstance(value, Texture):
                self._set_texture(name, value)
            else:
                self._set_uniform(name, value)
