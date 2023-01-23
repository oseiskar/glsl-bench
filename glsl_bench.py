
import os
from contextlib import contextmanager

from gl_objects import Shader

def parse_command_line_arguments():
    import argparse
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument('-refresh', '--refresh_every', type=int)
    arg_parser.add_argument('-np', '--numpy_output_file')
    arg_parser.add_argument('-png', '--png_output_file', default='out.png')
    arg_parser.add_argument('-res', '--preview_resolution')
    arg_parser.add_argument('--max_samples', type=int, default=0)
    arg_parser.add_argument('-s', '--sleep', type=float, default=0.0)
    arg_parser.add_argument('--seed', default=None)

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
        if isinstance(value, str) or isinstance(value, dict):
            bound_uniforms[name] = value
            uniforms[name] = None
        else:
            uniforms[name] = value
    return (uniforms, bound_uniforms)

def load_shader(json_path):

    if isinstance(json_path, str):
        import json
        json_data = json.loads(read_file(json_path))
        shader_dir = DirChanger(json_path)
    else:
        json_data = json_path
        shader_dir = DirChanger('.')

    if 'source' in json_data:
        source = json_data['source']
    else:
        source = shader_dir.read_file(json_data['source_path'])

    uniforms, mappings = get_uniform_values_and_mappings(json_data['uniforms'])
    shader = Shader(json_data['resolution'], source, uniforms)

    # TODO not a good approach
    shader.params = json_data
    shader.dir = shader_dir
    shader.uniform_mappings = mappings

    return shader

def genrate_random_array(distribution, size):
    if distribution == 'gauss': distribution = 'normal'
    func = getattr(numpy.random, distribution)
    return func(size=size)

def generate_random(command):
    parts = command.split('_')

    assert(len(parts) <= 3)
    assert(parts[0] == 'random')

    distribution = parts[1]

    if len(parts) > 1:
        size = int(parts[2])
    else:
        size = 1

    return list(genrate_random_array(distribution, size))

def main(args):

    import time
    from gl_boilerplate import texture_rect
    from gl_objects import Texture, Framebuffer
    from output_shader import OutputShader

    t0 = time.time()

    shader = load_shader(args.shader_file)

    window_resolution = shader.resolution
    if args.preview_resolution is not None:
        window_resolution = [int(x) for x in args.preview_resolution.split('x')]

    pygame.init()
    pygame.display.set_mode(window_resolution, pygame.locals.DOUBLEBUF | pygame.locals.OPENGL)
    if isinstance(args.shader_file, str):
        pygame.display.set_caption(args.shader_file)

    shader.build()

    monte_carlo = shader.params.get('monte_carlo')

    output_shader = OutputShader(
        resolution=shader.params['resolution'],
        gamma=shader.params.get('gamma', None),
        flip_y=shader.params.get('flip_y', False))

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

    glMatrixMode(GL_PROJECTION)
    glOrtho(-aspect, aspect, -1, 1, 1, -1)

    glMatrixMode(GL_MODELVIEW)
    glClear(GL_COLOR_BUFFER_BIT|GL_DEPTH_BUFFER_BIT)

    n_samples = 0

    refresh_every = shader.params.get('refresh_every', 1)
    if args.refresh_every is not None:
        refresh_every = args.refresh_every

    def save_results():
        if args.numpy_output_file is not None:
            # read image data from the framebuffer
            result_image = framebuffer.read()
            # save raw 32-bit float / HDR channels as a numpy array
            numpy.save(args.numpy_output_file, result_image)

        if args.png_output_file is not None:
            with output_shader.use_program(textures[1]._gl_handle):
                texture_rect(aspect)

            w, h = shader.params['resolution']
            result_image = glReadPixels(0, 0, w, h, GL_RGB, GL_UNSIGNED_BYTE)
            result_image = numpy.reshape(numpy.array(list(result_image)), (h, w, 3))
            result_image = result_image[::-1,...].astype(numpy.uint8)

            # normalize and save as 8-bit channels (PNG)
            import PIL.Image
            PIL.Image.fromarray(result_image).save(args.png_output_file)

    glEnable( GL_TEXTURE_2D )

    # handle compile time uniforms
    for name in list(shader.uniform_mappings.keys())[::]:
        source = shader.uniform_mappings[name]
        if isinstance(source, dict):
            def data_texture(**kwargs):
                return Texture(
                    internal_format = GL_RGBA32F,
                    interpolation=GL_NEAREST,
                    format = GL_RGBA,
                    texture_wrap=GL_CLAMP_TO_EDGE,
                    type = GL_FLOAT,
                    **kwargs)

            if 'random' in source:
                n = source['random']['size']
                shader.uniforms[name] = data_texture(
                    w = n*4,
                    h = 1,
                    content = numpy.zeros((1,n*4,4)))
                continue # updated on each frame
            elif 'data' in source:
                data = numpy.array(source['data'])
                shader.uniforms[name] = data_texture(content = data)
            else:
                # dict is texture file name
                with shader.dir.as_working_dir():
                    shader.uniforms[name] = Texture.load(source['file'])
        elif source == 'resolution':
            shader.uniforms[name] = [float(c) for c in shader.resolution]
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

    def do_quit():
        save_results()
        pygame.quit()
        quit()

    while True:
        n_samples += 1

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                do_quit()

        with shader.use_program():
            with framebuffer.render_to_texture(textures[1]):

                for name, source in shader.uniform_mappings.items():
                    if isinstance(source, dict):
                        r = source['random']
                        tex = shader.uniforms[name]
                        tex.update(genrate_random_array(r['distribution'], (tex.h, tex.w, 4)))
                        continue # no need to use with set_uniforms
                    elif source == 'time':
                        value = time.time() - t0
                    elif source == 'previous_frame':
                        value = textures[0]
                    elif source == 'mouse':
                        value = get_absolute_mouse()
                    elif source == 'relative_mouse':
                        value = get_rel_mouse()
                    elif source == 'frame_number':
                        value = float(n_samples)
                    elif 'random_' in source:
                        value = generate_random(source)
                    else:
                        raise RuntimeError('invalid uniform mapping %s <- %s' % (name, source))

                    shader.uniforms[name] = value

                shader.set_uniforms()

                # render
                texture_rect(aspect)

        if n_samples % refresh_every == 0:
            # render from texture 1
            with output_shader.use_program(textures[1]._gl_handle):
                texture_rect(aspect)

            pygame.display.flip()

        # flip buffers
        textures = textures[::-1]

        if args.max_samples > 0 and n_samples >= args.max_samples:
            do_quit()

        if args.sleep > 0.0:
            time.sleep(args.sleep)

if __name__ == '__main__':

    args = parse_command_line_arguments()

    from OpenGL.GL import *
    from OpenGL.GLU import *

    os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = '1'

    import pygame
    import pygame.locals
    import numpy

    if args.seed is not None:
        numpy.random.seed(int(args.seed))

    main(args)
