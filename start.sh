#!/bin/bash
set -e

# Install Aztec
bash -i <(curl -s https://install.aztec.network)

# Start Aztec in sandbox mode in the background
aztec start --sandbox &

# Start the Vite development server
exec yarn dev
