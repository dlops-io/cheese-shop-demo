#!/usr/bin/env bash
# Delete the local cluster and free the laptop's CPU and memory.
set -euo pipefail
kind delete cluster --name cheese-shop
