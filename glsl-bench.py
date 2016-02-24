
import pygame
import pygame.locals
import numpy
import time, sys, os, argparse
import json

from OpenGL.GL import *
from OpenGL.GLU import *

import scipy.misc

from gl_boilerplate import texture_rect
from gl_objects import Texture, Framebuffer, Shader

def parse_command_line_arguments():
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument('-refresh', '--refresh_every', type=int, default=1)
    arg_parser.add_argument('-np', '--numpy_output_file')
    arg_parser.add_argument('-png', '--png_output_file', default='out.png')
    arg_parser.add_argument('-res', '--preview_resolution')

    arg_parser.add_argument('shader_file')
    return arg_parser.parse_args()

def read_file(filename):
    with open(filename) as f:
        return f.read()

class ConfigurableShader(Shader):
    def __init__(self, json_path):
        json_data = json.loads(read_file(json_path))
        source = read_file(json_data['source_path'])

        uniforms = self._initialize_uniforms(json_data['uniforms'])
        Shader.__init__(self, json_data['resolution'], source, uniforms)

    def _initialize_uniforms(self, json_uniforms):
        uniforms = {}
        self.bound_uniforms = {}
        for name, value in json_uniforms.items():
            if isinstance(value, basestring) or isinstance(value, dict):
                self.bound_uniforms[name] = value
                uniforms[name] = None
            else:
                uniforms[name] = value
        return uniforms

def main(args):
    t0 = time.time()

    shader = ConfigurableShader(args.shader_file)

    window_resolution = shader.resolution
    if args.preview_resolution is not None:
        window_resolution = [int(x) for x in args.preview_resolution.split('x')]

    pygame.init()
    pygame.display.set_mode(window_resolution, pygame.locals.DOUBLEBUF | pygame.locals.OPENGL)
    pygame.display.set_caption(args.shader_file)

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

    def get_rel_mouse():
        x,y = pygame.mouse.get_pos()
        return [x / float(window_resolution[0]), y / float(window_resolution[1])]

    def get_absolute_mouse():
        x, y = get_rel_mouse()
        return [x*shader.resolution[0], y*shader.resolution[1]]

    while True:
        n_samples += 1

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                save_results()
                pygame.quit()
                quit()

        with shader.use_program():
            with framebuffer.render_to_texture(textures[1]):

                for name, source in shader.bound_uniforms.items():
                    if source == 'time':
                        shader.uniforms[name] = time.time() - t0
                    elif source == 'previous_frame':
                        shader.uniforms[name] = textures[0]
                    elif source == 'resolution':
                        shader.uniforms[name] = map(float, shader.resolution)
                    elif source == 'mouse':
                        shader.uniforms[name] = get_absolute_mouse()
                    elif source == 'relative_mouse':
                        shader.uniforms[name] = get_rel_mouse()
                    else:
                        raise RuntimeError('invalid uniform mapping %s <- %s' % (name, source))

                shader.set_uniforms()

                # render
                texture_rect(aspect)

        if n_samples % args.refresh_every == 0:
            # render from texture 0
            with textures[1].bind():
                texture_rect(aspect)

            pygame.display.flip()

        # flip buffers
        textures = textures[::-1]

if __name__ == '__main__':
    args = parse_command_line_arguments()
    main(args)
