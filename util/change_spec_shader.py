
import json

def read_json(fn):
    with open(fn) as f:
        return json.load(f)

if __name__ == '__main__':
    def parse_args():
        import argparse
        parser = argparse.ArgumentParser()

        parser.add_argument('glsl_bench_spec_json')
        parser.add_argument('new_shader', nargs='?', default=None)
        parser.add_argument('-o', '--output_file', default=None)
        return parser.parse_args()
    
    args = parse_args()

    spec = read_json(args.glsl_bench_spec_json)
    if args.new_shader is not None:
        with open(args.new_shader, 'rt') as f:
            spec['source'] = f.read()
    
    if args.output_file is not None:
        with open(args.output_file, 'wt') as f:
            json.dump(spec, f)
    else:
        print(spec['source'])
