
import pygame
import pygame.locals
import numpy
import time, sys, os, argparse

from OpenGL.GL import *
from OpenGL.GLU import *

import scipy.misc

from gl_objects import Shader, Texture, Framebuffer
from gl_boilerplate import texture_rect

def parse_command_line_arguments():
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument('-itr', '--itr_per_refresh', type=int, default=1)
    arg_parser.add_argument('-np', '--numpy_output_file')
    arg_parser.add_argument('-png', '--png_output_file', default='out.png')
    arg_parser.add_argument('-res', '--preview_resolution')

    arg_parser.add_argument('shader_file')
    return arg_parser.parse_args()

def main(args):
    t0 = time.time()

    shader = Shader.new_from_file(args.shader_file)

    window_resolution = shader.resolution
    if args.preview_resolution is not None:
        window_resolution = [int(x) for x in args.preview_resolution.split('x')]

    pygame.init()
    pygame.display.set_mode(window_resolution, pygame.locals.DOUBLEBUF | pygame.locals.OPENGL)

    shader.build()

    def new_texture():
        return Texture(*shader.resolution, \
            interpolation=GL_NEAREST, internal_format=GL_RGB32F, content=0.0)

    textures = [new_texture() for _ in range(2)]
    framebuffer = Framebuffer(*shader.resolution)

    aspect = shader.aspect_ratio

    glMatrixMode(GL_PROJECTION);
    glOrtho(-aspect, aspect, -1, 1, 1, -1)

    glMatrixMode(GL_MODELVIEW);
    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT)

    def save_results():

        # read image data from the framebuffer
        result_image = framebuffer.read()

        if args.numpy_output_file is not None:
            # save raw 32-bit float / HDR channels as a numpy array
            numpy.save(args.numpy_output_file, result_image)

        if args.png_output_file is not None:
            # normalize and save as 8-bit channels (PNG)
            result_image = numpy.clip(result_image / n_samples, 0.0, 1.0)*255
            result_image = result_image.astype(numpy.uint8)

            scipy.misc.imsave(args.png_output_file, result_image)

    glEnable( GL_TEXTURE_2D )
    n_samples = 0

    while True:
        n_samples += 1

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                save_results()
                pygame.quit()
                quit()

        with shader.use_program():
            with framebuffer.render_to_texture(textures[1]):

                t = n_samples * 0.01
                shader.set_textures(base_image=textures[0])
                shader.set_uniforms(t=t)

                # render
                texture_rect(aspect)

        # render from texture 0
        with textures[1].bind():
            texture_rect(aspect, 1.0 / n_samples)

        pygame.display.flip()
        pygame.time.wait(10)

        # flip buffers
        textures = textures[::-1]


if __name__ == '__main__':
    args = parse_command_line_arguments()
    main(args)
