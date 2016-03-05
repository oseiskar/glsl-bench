
import pygame
import pygame.locals
import numpy
import time, sys, os, argparse
import json
from contextlib import contextmanager

from OpenGL.GL import *
from OpenGL.GLU import *

import scipy.misc

from gl_boilerplate import texture_rect
from gl_objects import Texture, Framebuffer, Shader

def parse_command_line_arguments():
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument('-refresh', '--refresh_every', type=int)
    arg_parser.add_argument('-np', '--numpy_output_file')
    arg_parser.add_argument('-png', '--png_output_file', default='out.png')
    arg_parser.add_argument('-res', '--preview_resolution')

    arg_parser.add_argument('shader_file')
    return arg_parser.parse_args()

def read_file(filename):
    with open(filename) as f:
        return f.read()

class DirChanger:
    def __init__(self, filename):
        self.dir = os.path.abspath(os.path.dirname(filename))

    @contextmanager
    def as_working_dir(self):
        current = os.getcwd()
        try:
            os.chdir(self.dir)
            yield
        finally:
            os.chdir(current)

    def read_file(self, filename):
        with self.as_working_dir():
            return read_file(filename)

def get_uniform_values_and_mappings(json_uniforms):
    uniforms = {}
    bound_uniforms = {}
    for name, value in json_uniforms.items():
        if isinstance(value, basestring) or isinstance(value, dict):
            bound_uniforms[name] = value
            uniforms[name] = None
        else:
            uniforms[name] = value
    return (uniforms, bound_uniforms)

def load_shader(json_path):

        json_data = json.loads(read_file(json_path))
        shader_dir = DirChanger(json_path)

        source = shader_dir.read_file(json_data['source_path'])

        template_params = json_data.get('mustache', None)
        if template_params is not None:
            import pystache
            source = pystache.render(source, template_params)
            #with open('out.glsl', 'w') as f: f.write(source)

        uniforms, mappings = get_uniform_values_and_mappings(json_data['uniforms'])
        shader = Shader(json_data['resolution'], source, uniforms)

        # TODO not a good approach
        shader.params = json_data
        shader.dir = shader_dir
        shader.uniform_mappings = mappings

        return shader

def generate_random(command):
    parts = command.split('_')

    assert(len(parts) <= 3)
    assert(parts[0] == 'random')

    distribution = parts[1]
    if distribution == 'gauss': distribution = 'normal'

    if len(parts) > 1:
        size = int(parts[2])
    else:
        size = 1

    func = getattr(numpy.random, distribution)
    return [func() for _ in xrange(size)]

def main(args):
    t0 = time.time()

    shader = load_shader(args.shader_file)

    window_resolution = shader.resolution
    if args.preview_resolution is not None:
        window_resolution = [int(x) for x in args.preview_resolution.split('x')]

    pygame.init()
    pygame.display.set_mode(window_resolution, pygame.locals.DOUBLEBUF | pygame.locals.OPENGL)
    pygame.display.set_caption(args.shader_file)

    shader.build()

    monte_carlo = shader.params.get('monte_carlo')

    def new_texture():
        extra_args = {}
        # in Monte Carlo mode, use float32 textures
        if shader.params.get('float_buffers') or monte_carlo:
            extra_args['internal_format'] = GL_RGB32F
        return Texture(*shader.resolution, \
            interpolation=GL_NEAREST, content=0.0, **extra_args)

    textures = [new_texture() for _ in range(2)]
    framebuffer = Framebuffer(*shader.resolution)

    aspect = shader.aspect_ratio

    glMatrixMode(GL_PROJECTION);
    glOrtho(-aspect, aspect, -1, 1, 1, -1)

    glMatrixMode(GL_MODELVIEW);
    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT)

    n_samples = 0

    refresh_every = shader.params.get('refresh_every', 1)
    if args.refresh_every is not None:
        refresh_every = args.refresh_every

    def save_results():

        # read image data from the framebuffer
        result_image = framebuffer.read()

        if monte_carlo: result_image = result_image / n_samples

        if args.numpy_output_file is not None:
            # save raw 32-bit float / HDR channels as a numpy array
            numpy.save(args.numpy_output_file, result_image)

        if args.png_output_file is not None:
            # normalize and save as 8-bit channels (PNG)
            result_image = numpy.clip(result_image, 0.0, 1.0)*255
            result_image = result_image.astype(numpy.uint8)

            scipy.misc.imsave(args.png_output_file, result_image)

    glEnable( GL_TEXTURE_2D )

    # handle compile time uniforms
    for name in shader.uniform_mappings.keys()[::]:
        source = shader.uniform_mappings[name]
        if isinstance(source, dict):
            # dict is texture
            with shader.dir.as_working_dir():
                shader.uniforms[name] = Texture.load(source['file'])
        elif source == 'resolution':
            shader.uniforms[name] = map(float, shader.resolution)
        else:
            # the rest are run-time mapped values
            continue

        del shader.uniform_mappings[name]

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

                for name, source in shader.uniform_mappings.items():
                    if source == 'time':
                        value = time.time() - t0
                    elif source == 'previous_frame':
                        value = textures[0]
                    elif source == 'mouse':
                        value = get_absolute_mouse()
                    elif source == 'relative_mouse':
                        value = get_rel_mouse()
                    elif 'random_' in source:
                        value = generate_random(source)
                    else:
                        raise RuntimeError('invalid uniform mapping %s <- %s' % (name, source))

                    shader.uniforms[name] = value

                shader.set_uniforms()

                if monte_carlo:
                    color_scale = 1.0 / n_samples
                else:
                    color_scale = 1.0

                # render
                texture_rect(aspect, color_scale)

        if n_samples % refresh_every == 0:
            # render from texture 0
            with textures[1].bind():
                texture_rect(aspect)

            pygame.display.flip()

        # flip buffers
        textures = textures[::-1]

if __name__ == '__main__':
    args = parse_command_line_arguments()
    main(args)
