
def parse_command_line_arguments():
    import argparse
    arg_parser = argparse.ArgumentParser()
    arg_parser.add_argument('shader_file')
    arg_parser.add_argument('-i', '--html_template', default='glsl_bench.html')
    return arg_parser.parse_args()

if __name__ == '__main__':

    from glsl_bench import load_shader, read_file
    import pystache, json

    args = parse_command_line_arguments()
    shader = load_shader(args.shader_file)
    template = read_file(args.html_template)
    html = pystache.render(template, {
        'shader_source': shader.source,
        'shader_params': json.dumps(shader.params) })

    print html
