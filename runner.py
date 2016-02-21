
import pygame
import pygame.locals
import numpy
import time, sys, os, argparse

from OpenGL.GL import *
from OpenGL.GLU import *

import scipy.misc

from gl_boilerplate import compile_program, create_texture, PASSTHROUGH_VERTEX_SHADER

def parse_command_line_arguments():
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument('-itr', '--itr_per_refresh', type=int, default=1)
    arg_parser.add_argument('-np', '--numpy_output_file')
    arg_parser.add_argument('-png', '--png_output_file', default='out.png')

    arg_parser.add_argument('shader_file')
    return arg_parser.parse_args()

def read_file(filename):
    with open(filename) as f:
        return f.read()

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

def main(args):
    t0 = time.time()

    pygame.init()
    display = (800,600)
    pygame.display.set_mode(display, pygame.locals.DOUBLEBUF | pygame.locals.OPENGL)

    def new_texture():
        return create_texture(display[0], display[1], \
            interpolation=GL_NEAREST, internal_format=GL_RGB32F, content=0.0)

    framebuffer = glGenFramebuffers(1)
    textures = [new_texture() for _ in range(2)]

    def read_framebuffer():
        glBindFramebuffer(GL_FRAMEBUFFER, framebuffer)
        texture_data = glReadPixels(0,0, display[0], display[1], GL_RGB, GL_FLOAT)
        texture_data = numpy.reshape(texture_data, (display[1], display[0], 3))
        texture_data = texture_data[::-1,:,:]
        return texture_data

    aspect = display[0]/float(display[1])
    glMatrixMode(GL_PROJECTION);
    glOrtho(-aspect, aspect, -1, 1, 1, -1)

    glMatrixMode(GL_MODELVIEW);
    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT)

    shader = compile_program(PASSTHROUGH_VERTEX_SHADER, read_file(args.shader_file))

    uniform_names = ('t', 'base_image', 'resolution')
    uniforms = { name: glGetUniformLocation(shader, name) for name in uniform_names }

    glEnable( GL_TEXTURE_2D )

    n_samples = 0

    def save_results():

        # read image data from the framebuffer
        result_image = read_framebuffer()

        if args.numpy_output_file is not None:
            # save raw 32-bit float / HDR channels as a numpy array
            numpy.save(args.numpy_output_file, result_image)

        if args.png_output_file is not None:
            # normalize and save as 8-bit channels (PNG)
            result_image = numpy.clip(result_image / n_samples, 0.0, 1.0)*255
            result_image = result_image.astype(numpy.uint8)

            scipy.misc.imsave(args.png_output_file, result_image)

    while True:
        n_samples += 1

        for event in pygame.event.get():
            if event.type == pygame.QUIT:

                save_results()

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
        texture_rect(aspect, 1.0 / n_samples)

        glBindTexture(GL_TEXTURE_2D, 0)

        pygame.display.flip()
        pygame.time.wait(10)

        # flip buffers
        textures = textures[::-1]


if __name__ == '__main__':
    args = parse_command_line_arguments()
    main(args)
