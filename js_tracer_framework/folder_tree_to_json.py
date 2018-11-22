#!/usr/bin/python
import os, sys, argparse, fnmatch, json

def parse_args():
    args = argparse.ArgumentParser(description=\
        'recursively read folders structure to a single JSON file')
    args.add_argument('target_dir')
    args.add_argument('--pattern')
    return args.parse_args()

args = parse_args()

def dir_to_json(path):
    r = {}
    for f in os.listdir(path):
        full = os.path.join(path, f)
        if os.path.isdir(full):
            sub = dir_to_json(full)
            if len(sub) > 0:
                r[f] = sub
        elif args.pattern is None or fnmatch.fnmatch(f, args.pattern):
            with open(full) as ff:
                r[f] = ff.read()
    return r

print(json.dumps(dir_to_json(args.target_dir), indent=2, ensure_ascii=True).replace('/', '\\/'))
