#!/bin/bash
# Deployment script for VPS
# Run this on the VPS: ssh -p 2222 nurbe@164.92.240.90
# Then: cd /opt/Nexus && bash deploy-vps.sh

cd /opt/Nexus

# Pull latest changes
git pull origin main

# Install dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install agent dependencies
cd agent && npm install && cd ..

# Restart services (adjust based on your setup)
# pm2 restart all
# or systemctl restart nexus

echo "Deployment completed!"
