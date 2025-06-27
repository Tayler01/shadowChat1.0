#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Setting up Realtime Chat Platform..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Please run this script from the project root."
  exit 1
fi

# Install project dependencies
echo "📦 Installing npm dependencies..."
if [ -f "package-lock.json" ]; then
  npm ci
else
  npm install
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo "⚠️  Warning: .env file not found."
  echo "📋 Please create a .env file with your Supabase credentials:"
  echo "   VITE_SUPABASE_URL=your_supabase_project_url"
  echo "   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key"
  echo ""
  echo "💡 You can copy .env.example to .env and fill in your values:"
  echo "   cp .env.example .env"
else
  echo "✅ .env file found"
fi

# Check if Supabase migrations exist
if [ -d "supabase/migrations" ] && [ "$(ls -A supabase/migrations 2>/dev/null)" ]; then
  echo "📊 Supabase migrations found in supabase/migrations/"
  echo "💡 Make sure to apply these migrations to your Supabase project"
  echo "   You can do this through the Supabase dashboard or CLI"
else
  echo "⚠️  No Supabase migrations found"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🎯 Next steps:"
echo "1. Make sure your .env file has the correct Supabase credentials"
echo "2. Apply the database migrations to your Supabase project"
echo "3. Run 'npm run dev' to start the development server"
echo ""
echo "🔗 Useful commands:"
echo "   npm run dev     - Start development server"
echo "   npm run build   - Build for production"
echo "   npm run lint    - Run ESLint"
echo ""