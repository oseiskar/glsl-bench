import numpy
from contextlib import contextmanager

from OpenGL.GL import *
from texture import Texture

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
            texture_data = texture_data[::-1,...]
            return texture_data
