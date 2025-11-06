#!/bin/bash

code_base_dir="$(dirname "$PWD")"
image_version="production"
host_bind="0.0.0.0"
port_bind="8081"
echo "code_base_dir=$code_base_dir"
echo "image_version=$image_version"
echo "host_bind=$host_bind"
echo "port_bind=$port_bind"

#python -m auto_deploy.hook_server --code_base_dir "$code_base_dir" --image_version "$image_version" --host "$host_bind" --port "$port_bind"
nohup python -m auto_deploy.hook_server --code_base_dir "$code_base_dir" --image_version "$image_version" --host "$host_bind" --port "$port_bind" > ./auto_deploy.production.log 2>&1 &
