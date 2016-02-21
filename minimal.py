import ctypes
import sys

import pygame
import pygame.locals
import numpy

from OpenGL.GL import *
from OpenGL.GLU import *

def create_texture(w, h, content=None):

    if content is None:
        content = numpy.zeros([w,h,3],float)

    texture = glGenTextures(1)
    glBindTexture( GL_TEXTURE_2D, texture )
    #glTexEnvf( GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_MODULATE );
    #glTexParameterf( GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    #glTexParameterf( GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST)
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST)
    glTexImage2D(GL_TEXTURE_2D,0,GL_RGB,w,h,0,GL_RGB,GL_FLOAT,content)

    glBindTexture( GL_TEXTURE_2D, 0 ) # necessary?
    return texture

def print_log(shader):
    length = ctypes.c_int()
    glGetShaderiv(shader, GL_INFO_LOG_LENGTH, ctypes.byref(length))

    if length.value > 0:
        print >> sys.stderr, glGetShaderInfoLog(shader)

def compile_shader(source, shader_type):
    shader = glCreateShader(shader_type)
    glShaderSource(shader, source)
    glCompileShader(shader)

    status = ctypes.c_int()
    glGetShaderiv(shader, GL_COMPILE_STATUS, ctypes.byref(status))
    if not status.value:
        print_log(shader)
        glDeleteShader(shader)
        raise ValueError, 'Shader compilation failed'
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








def color_rect(aspect, r, g, b):

    glBegin(GL_QUADS)
    glColor3f(r, g, b)
    glVertex3f(-aspect,-1, 0)
    glVertex3f( aspect,-1, 0)
    glVertex3f( aspect, 1, 0)
    glVertex3f(-aspect, 1, 0)
    glEnd()

def texture_rect(aspect):
    glBegin(GL_QUADS)
    glTexCoord2f(0,0)
    glVertex3f(-aspect,-1, 0)
    glTexCoord2f(1,0)
    glVertex3f( aspect,-1, 0)
    glTexCoord2f(1,1)
    glVertex3f( aspect, 1, 0)
    glTexCoord2f(0,1)
    glVertex3f(-aspect, 1, 0)
    glEnd()



def main():
    pygame.init()
    display = (800,600)
    pygame.display.set_mode(display, pygame.locals.DOUBLEBUF | pygame.locals.OPENGL)

    framebuffer = glGenFramebuffers(1)
    textures = [create_texture(display[0],display[1]) for _ in range(2)]

    aspect = display[0]/float(display[1])
    glMatrixMode(GL_PROJECTION);
    glOrtho(-aspect, aspect, -1, 1, 1, -1)

    glMatrixMode(GL_MODELVIEW);
    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT)

    shader = compile_program('''
        // Vertex program
        varying vec3 pos;
        void main() {
            pos = gl_Vertex.xyz;
            gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;
        }
        ''', '''
        // Fragment program
        varying vec3 pos;
        void main() {
            gl_FragColor = vec4(pos.xyz, 1.0);
        }
        ''')

    #glDisable( GL_DEPTH_TEST )

    for tex in textures:


        # render to texture 0
        glBindFramebuffer(GL_FRAMEBUFFER, framebuffer)
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, tex, 0)

        glPushAttrib(GL_VIEWPORT_BIT)
        glViewport(0,0,display[0],display[1])

        glClearColor(0.0, 0.0, 0.0, 0.0)
        glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT)

        glUseProgram(shader)
        # render
        #texture_rect(aspect)
        color_rect(aspect, 1,tex-1,0)
        #texture_rect(aspect)

        # now render to screen
        glPopAttrib();
        glBindFramebuffer(GL_FRAMEBUFFER, 0)
        #glBindTexture(GL_TEXTURE_2D, 0)

    glUseProgram(0)
    glEnable( GL_TEXTURE_2D )

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                quit()

        # render from texture 0
        glBindTexture(GL_TEXTURE_2D, textures[0])
        texture_rect(aspect)

        glBindTexture(GL_TEXTURE_2D, 0)

        pygame.display.flip()
        pygame.time.wait(10)

        #textures = textures[::-1]


main()
