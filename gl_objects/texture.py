import numpy
from contextlib import contextmanager

from OpenGL.GL import *

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
