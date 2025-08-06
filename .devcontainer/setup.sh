#!/bin/bash

# Arctos Robot Controller Development Environment Setup
echo "🤖 Setting up Arctos Robot Controller development environment..."

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install

# Install frontend dependencies
echo "⚛️ Installing frontend dependencies..."
cd client && npm install
cd ..

# Create config and data directories
echo "📁 Creating necessary directories..."
mkdir -p config data

echo "✅ Development environment setup complete!"
echo ""
echo "🚀 To start development:"
echo "  Backend:  npm start (runs on port 5000)"
echo "  Frontend: cd client && npm start (runs on port 3000)"
echo ""
echo "📝 Both ports are automatically forwarded in Codespaces"