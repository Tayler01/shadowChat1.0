#!/usr/bin/env bash
set -euo pipefail

# --- Node.js installation (if needed) ---
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Installing Node 18..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# --- Install project dependencies ---
echo "Installing npm dependencies..."
npm ci

# --- Optional: Supabase CLI & migrations ---
if ! command -v supabase >/dev/null 2>&1; then
  echo "Installing Supabase CLI..."
  npm install -g supabase
fi

if [ -d "supabase/migrations" ]; then
  echo "Applying Supabase migrations..."
  supabase db push
fi

echo "Setup complete."
