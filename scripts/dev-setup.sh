#!/bin/bash

# Development environment setup script
set -e

echo "🚀 Setting up Arctos Robot Controller development environment..."

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Docker on macOS
install_docker_mac() {
    echo "📦 Installing Docker Desktop for Mac..."
    if ! command_exists brew; then
        echo "❌ Homebrew is required but not installed. Please install it first."
        echo "Visit: https://brew.sh"
        exit 1
    fi
    brew install --cask docker
    echo "✅ Docker installed. Please start Docker Desktop manually."
}

# Function to install Docker on Linux
install_docker_linux() {
    echo "📦 Installing Docker on Linux..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "✅ Docker installed. Please log out and back in to use Docker without sudo."
}

# Function to install kubectl
install_kubectl() {
    echo "📦 Installing kubectl..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install kubectl
    else
        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
        sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
        rm kubectl
    fi
    echo "✅ kubectl installed"
}

# Function to install Helm
install_helm() {
    echo "📦 Installing Helm..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install helm
    else
        curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    fi
    echo "✅ Helm installed"
}

# Function to install Terraform
install_terraform() {
    echo "📦 Installing Terraform..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew tap hashicorp/tap
        brew install hashicorp/tap/terraform
    else
        wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
        echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
        sudo apt update && sudo apt install terraform
    fi
    echo "✅ Terraform installed"
}

# Function to install AWS CLI
install_aws_cli() {
    echo "📦 Installing AWS CLI..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install awscli
    else
        curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
        unzip awscliv2.zip
        sudo ./aws/install
        rm -rf aws awscliv2.zip
    fi
    echo "✅ AWS CLI installed"
}

# Function to check Node.js version
check_node() {
    if command_exists node; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 18 ]; then
            echo "✅ Node.js $(node -v) is installed"
            return 0
        else
            echo "❌ Node.js version is too old. Please update to v18 or later."
            return 1
        fi
    else
        echo "❌ Node.js is not installed"
        return 1
    fi
}

# Function to install Node.js
install_node() {
    echo "📦 Installing Node.js..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install node@20
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    echo "✅ Node.js installed"
}

# Main setup process
main() {
    echo "🔍 Checking system requirements..."
    
    # Check Node.js
    if ! check_node; then
        install_node
    fi
    
    # Check Docker
    if ! command_exists docker; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            install_docker_mac
        else
            install_docker_linux
        fi
    else
        echo "✅ Docker is installed"
    fi
    
    # Check kubectl
    if ! command_exists kubectl; then
        install_kubectl
    else
        echo "✅ kubectl is installed"
    fi
    
    # Check Helm
    if ! command_exists helm; then
        install_helm
    else
        echo "✅ Helm is installed"
    fi
    
    # Check Terraform
    if ! command_exists terraform; then
        install_terraform
    else
        echo "✅ Terraform is installed"
    fi
    
    # Check AWS CLI
    if ! command_exists aws; then
        install_aws_cli
    else
        echo "✅ AWS CLI is installed"
    fi
    
    # Install project dependencies
    echo "📦 Installing project dependencies..."
    npm install
    cd client && npm install
    cd ..
    
    # Set up Git hooks
    echo "🔧 Setting up Git hooks..."
    npx husky install
    
    # Create local development files
    echo "📝 Creating development configuration files..."
    
    # Create .env.development if it doesn't exist
    if [ ! -f .env.development ]; then
        cat > .env.development << EOF
NODE_ENV=development
PORT=5000
DB_PATH=data/database.sqlite
REDIS_URL=redis://localhost:6379
LOG_LEVEL=debug
JWT_SECRET=development-jwt-secret-key
EOF
        echo "✅ Created .env.development"
    fi
    
    # Create docker-compose override for development
    if [ ! -f docker-compose.override.yml ]; then
        cat > docker-compose.override.yml << EOF
version: '3.8'
services:
  arctos-robot-controller:
    volumes:
      - .:/app
      - /app/node_modules
      - /app/client/node_modules
    environment:
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true
    command: npm run dev
EOF
        echo "✅ Created docker-compose.override.yml"
    fi
    
    # Set up development database
    echo "🗄️ Setting up development database..."
    mkdir -p data config logs
    
    # Create initial configuration
    if [ ! -f config/robot-config.json ]; then
        cat > config/robot-config.json << EOF
{
  "robotType": "6-axis-arm",
  "communicationProtocol": "serial",
  "serialPort": "/dev/ttyUSB0",
  "baudRate": 115200,
  "axes": [
    {"id": 1, "name": "Base", "minPosition": -180, "maxPosition": 180, "currentPosition": 0},
    {"id": 2, "name": "Shoulder", "minPosition": -90, "maxPosition": 90, "currentPosition": 0},
    {"id": 3, "name": "Elbow", "minPosition": -120, "maxPosition": 120, "currentPosition": 0},
    {"id": 4, "name": "Wrist Pitch", "minPosition": -90, "maxPosition": 90, "currentPosition": 0},
    {"id": 5, "name": "Wrist Roll", "minPosition": -180, "maxPosition": 180, "currentPosition": 0},
    {"id": 6, "name": "Gripper", "minPosition": 0, "maxPosition": 100, "currentPosition": 0}
  ]
}
EOF
        echo "✅ Created initial robot configuration"
    fi
    
    echo "🎉 Development environment setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Start the application:"
    echo "   npm start (backend)"
    echo "   cd client && npm start (frontend)"
    echo ""
    echo "2. Or use Docker Compose:"
    echo "   docker-compose up -d"
    echo ""
    echo "3. Access the application:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend: http://localhost:5000"
    echo ""
    echo "4. Run tests:"
    echo "   npm test"
    echo "   npm run test:e2e"
    echo ""
    echo "5. View logs:"
    echo "   docker-compose logs -f"
    echo ""
    echo "📚 Documentation:"
    echo "   - DevOps Guide: docs/DEVOPS_GUIDE.md"
    echo "   - API Documentation: http://localhost:5000/api-docs"
    echo ""
    echo "🛠️  Development tools:"
    echo "   - Linting: npm run lint"
    echo "   - Formatting: npm run format"
    echo "   - Security scan: npm audit"
}

# Run main function
main

echo "✨ Happy coding!"