
import pygame
import pygame.locals
import numpy
import time

from OpenGL.GL import *
from OpenGL.GLU import *

from gl_boilerplate import compile_program, create_texture, PASSTHROUGH_VERTEX_SHADER

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

def main():
    t0 = time.time()

    pygame.init()
    display = (800,600)
    pygame.display.set_mode(display, pygame.locals.DOUBLEBUF | pygame.locals.OPENGL)

    def new_texture():
        return create_texture(display[0], display[1], \
            interpolation=GL_NEAREST, internal_format=GL_RGB32F, content=0.0)

    framebuffer = glGenFramebuffers(1)
    textures = [new_texture() for _ in range(2)]

    aspect = display[0]/float(display[1])
    glMatrixMode(GL_PROJECTION);
    glOrtho(-aspect, aspect, -1, 1, 1, -1)

    glMatrixMode(GL_MODELVIEW);
    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT)

    shader = compile_program(PASSTHROUGH_VERTEX_SHADER, '''

        // Fragment shader

        uniform vec2 resolution;
        uniform float t;
        uniform sampler2D base_image;

        varying vec3 pos;

        void main() {

            vec2 center = vec2(cos(t)*0.4, sin(t)*0.3);
            vec3 base_color = texture2D(base_image, gl_FragCoord.xy / resolution.xy).xyz;

            vec3 cur_color = vec3(0.0,0.0,0.0);

            if (length(center-pos.xy) < 0.2)
                cur_color = vec3(1.0, 1.0, 0.5);

            gl_FragColor = vec4(base_color + cur_color, 1.0);
        }
        ''')

    uniform_names = ('t', 'base_image', 'resolution')
    uniforms = { name: glGetUniformLocation(shader, name) for name in uniform_names }

    glEnable( GL_TEXTURE_2D )

    n_samples = 0

    while True:
        n_samples += 1

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                quit()

        # render to texture
        glBindFramebuffer(GL_FRAMEBUFFER, framebuffer)
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, textures[1], 0)

        glUseProgram(shader)

        t = n_samples * 0.01

        glUniform1f(uniforms['t'], t)
        glUniform2f(uniforms['resolution'], display[0], display[1])

        # bind texture 0 to base_image sampler, and texture unit 0

        gl_texture_unit = 0
        glActiveTexture(GL_TEXTURE0 + gl_texture_unit)
        glBindTexture(GL_TEXTURE_2D, textures[0])
        glUniform1i(uniforms['base_image'], gl_texture_unit)

        # render
        texture_rect(aspect)

        # now render to screen
        glBindFramebuffer(GL_FRAMEBUFFER, 0)
        glUseProgram(0)

        # render from texture 0
        glBindTexture(GL_TEXTURE_2D, textures[1])
        texture_rect(aspect, 1.0 / (n_samples+1))

        glBindTexture(GL_TEXTURE_2D, 0)

        pygame.display.flip()
        pygame.time.wait(10)

        # flip buffers
        textures = textures[::-1]


main()
