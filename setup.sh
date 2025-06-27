#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Setting up Realtime Chat Platform..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: package.json not found. Please run this script from the project root."
  exit 1
fi

# Check Node.js version
echo "🔍 Checking Node.js version..."
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node --version)
  echo "✅ Node.js version: $NODE_VERSION"
else
  echo "❌ Node.js not found. This is required for the project."
  exit 1
fi

# Check npm version
if command -v npm >/dev/null 2>&1; then
  NPM_VERSION=$(npm --version)
  echo "✅ npm version: $NPM_VERSION"
else
  echo "❌ npm not found. This is required for the project."
  exit 1
fi

# Install project dependencies
echo "📦 Installing npm dependencies..."
if [ -f "package-lock.json" ]; then
  npm ci
else
  npm install
fi

# Verify critical dependencies
echo "🔍 Verifying critical dependencies..."
CRITICAL_DEPS=("react" "@supabase/supabase-js" "vite" "tailwindcss")
for dep in "${CRITICAL_DEPS[@]}"; do
  if npm list "$dep" >/dev/null 2>&1; then
    echo "✅ $dep installed"
  else
    echo "❌ Critical dependency missing: $dep"
    exit 1
  fi
done

# Check TypeScript configuration
if [ -f "tsconfig.json" ]; then
  echo "✅ TypeScript configuration found"
else
  echo "⚠️  TypeScript configuration not found"
fi

# Check Tailwind configuration
if [ -f "tailwind.config.js" ]; then
  echo "✅ Tailwind CSS configuration found"
else
  echo "⚠️  Tailwind CSS configuration not found"
fi

# Check Vite configuration
if [ -f "vite.config.ts" ]; then
  echo "✅ Vite configuration found"
else
  echo "⚠️  Vite configuration not found"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo "⚠️  Warning: .env file not found."
  echo "📋 Please create a .env file with your Supabase credentials:"
  echo "   VITE_SUPABASE_URL=your_supabase_project_url"
  echo "   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key"
  echo "   VITE_PRESENCE_INTERVAL_MS=30000"
  echo ""
  echo "💡 You can copy .env.example to .env and fill in your values:"
  echo "   cp .env.example .env"
else
  echo "✅ .env file found"
  
  # Check if required environment variables are set
  if [ -f ".env" ]; then
    if grep -q "VITE_SUPABASE_URL=" .env && grep -q "VITE_SUPABASE_ANON_KEY=" .env; then
      echo "✅ Required Supabase environment variables found"
    else
      echo "⚠️  Some required environment variables may be missing in .env"
      echo "   Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY"
    fi
  fi
fi

# Check if Supabase migrations exist
if [ -d "supabase/migrations" ] && [ "$(ls -A supabase/migrations 2>/dev/null)" ]; then
  MIGRATION_COUNT=$(ls -1 supabase/migrations/*.sql 2>/dev/null | wc -l)
  echo "📊 Found $MIGRATION_COUNT Supabase migration(s) in supabase/migrations/"
  echo "💡 Make sure to apply these migrations to your Supabase project:"
  echo "   - Through Supabase Dashboard > SQL Editor"
  echo "   - Or using Supabase CLI (if available)"
  echo ""
  echo "📋 Migration files found:"
  for file in supabase/migrations/*.sql; do
    if [ -f "$file" ]; then
      echo "   - $(basename "$file")"
    fi
  done
else
  echo "⚠️  No Supabase migrations found"
fi

# Check for common issues
echo "🔍 Checking for common issues..."

# Check if port 5173 is available (Vite default)
if command -v lsof >/dev/null 2>&1; then
  if lsof -i :5173 >/dev/null 2>&1; then
    echo "⚠️  Port 5173 is already in use. Vite may use a different port."
  else
    echo "✅ Port 5173 is available"
  fi
fi

# Check file permissions
if [ -r "package.json" ] && [ -r "src/main.tsx" ]; then
  echo "✅ File permissions look good"
else
  echo "⚠️  Some files may have permission issues"
fi

# Validate package.json structure
if command -v node >/dev/null 2>&1; then
  if node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" 2>/dev/null; then
    echo "✅ package.json is valid JSON"
  else
    echo "❌ package.json contains invalid JSON"
    exit 1
  fi
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
echo "   npm run preview - Preview production build"
echo ""
echo "🐛 Troubleshooting:"
echo "   - If you see auth errors, check your Supabase credentials"
echo "   - If real-time features don't work, verify your Supabase project settings"
echo "   - For build issues, try 'rm -rf node_modules && npm install'"
echo ""
echo "📚 Documentation:"
echo "   - Project README: ./README.md"
echo "   - Supabase Docs: https://supabase.com/docs"
echo "   - React Docs: https://react.dev"
echo ""