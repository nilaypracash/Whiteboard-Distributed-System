# Whiteboard - Collaborative Drawing App

A real-time collaborative whiteboard built with Node.js, Y.js, WebSocket, and CouchDB.

## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
- [Local Development](#local-development)
- [Deploying to GKE](#deploying-to-gke)
- [Making Changes & Pushing](#making-changes--pushing)
- [Troubleshooting](#troubleshooting)

## Features
- Real-time collaborative drawing
- Multiple rooms support
- Drawing tools: Pen, Rectangle, Text
- Color picker
- Multi-master replication across nodes
- WebSocket for instant sync

## Prerequisites

You need to install:

1. **Google Cloud SDK (gcloud)**
   - Download: https://cloud.google.com/sdk/docs/install
   - Install and run: `gcloud init`

2. **kubectl** (Kubernetes CLI)
   - Download: https://kubernetes.io/docs/tasks/tools/
   - Or: `gcloud components install kubectl`

3. **Docker** (for building images)
   - Download: https://www.docker.com/products/docker-desktop

4. **Node.js** (for local development)
   - Download: https://nodejs.org/ (v16+)
   - Verify: `node -v` and `npm -v`

5. **Git**
   - Download: https://git-scm.com/

## Setup Guide

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/Whiteboard.git
cd Whiteboard
```

### Step 2: Set Up Google Cloud Project

```bash
# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project whiteboard-479910

# Authenticate Docker to push images
gcloud auth configure-docker gcr.io
```

### Step 3: Create a GKE Cluster

```bash
# Create cluster (first time only)
gcloud container clusters create whiteboard-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-1

# Get credentials
gcloud container clusters get-credentials whiteboard-cluster --zone us-central1-a
```

### Step 4: Deploy to Kubernetes

```bash
# Create CouchDB credentials secret
kubectl create secret generic couchdb-credentials \
  --from-literal=username=admin \
  --from-literal=password=password

# Apply all manifests
kubectl apply -f k8s/couchdb-statefulset.yaml
kubectl apply -f k8s/app-deployment-a.yaml
kubectl apply -f k8s/app-deployment-b.yaml
kubectl apply -f k8s/app-service-a.yaml
kubectl apply -f k8s/app-service-b.yaml

# Wait for pods to be ready
kubectl get pods -w
# Press Ctrl+C when all show 1/1 Running
```

### Step 5: Get External IPs

```bash
kubectl get svc lb-a lb-b
```

You'll see output like:
```
NAME   TYPE           CLUSTER-IP      EXTERNAL-IP     PORT(S)
lb-a   LoadBalancer   34.118.237.210  34.147.227.47   80:31046/TCP
lb-b   LoadBalancer   34.118.228.153  34.105.200.49   80:31248/TCP
```

Open in your browser:
- `http://34.147.227.47`
- `http://34.105.200.49`

## Local Development

### Running Locally

```bash
cd server
npm install
npm start
```

Open `http://localhost:8080` in your browser.

### Project Structure

```
Whiteboard/
├── server/
│   ├── server.js           # Backend (Express + WebSocket)
│   ├── build-frontend.js   # Build script
│   ├── public/
│   │   ├── index.html      # Frontend HTML
│   │   ├── main.js         # Frontend logic (Y.js + Canvas)
│   │   └── style.css       # Styling
│   └── package.json
├── k8s/                    # Kubernetes manifests
│   ├── couchdb-statefulset.yaml
│   ├── app-deployment-a.yaml
│   ├── app-deployment-b.yaml
│   ├── app-service-a.yaml
│   ├── app-service-b.yaml
│   └── app-hpa.yaml       # Auto-scaling
└── README.md
```

### Making Code Changes

#### Backend Changes (server.js)

1. Edit `server/server.js`
2. Test locally: `npm start`
3. Rebuild Docker image:
```bash
cd server
docker build -t gcr.io/whiteboard-479910/wb-app:latest .
docker push gcr.io/whiteboard-479910/wb-app:latest
```
4. Restart pods:
```bash
kubectl rollout restart deployment/app-a deployment/app-b
```

#### Frontend Changes (main.js, index.html, style.css)

1. Edit files in `server/public/`
2. Run build:
```bash
cd server
node build-frontend.js
```
3. Test locally: `npm start`
4. Rebuild and push:
```bash
docker build -t gcr.io/whiteboard-479910/wb-app:latest .
docker push gcr.io/whiteboard-479910/wb-app:latest
kubectl rollout restart deployment/app-a deployment/app-b
```

### Committing Changes

```bash
# Stage changes
git add .

# Commit with message
git commit -m "Add feature: text tool"

# Push to GitHub
git push origin main
```

## Deploying to GKE

### Full Deployment Flow

1. **Make changes** to code locally
2. **Test** with `npm start`
3. **Build Docker image**:
   ```bash
   cd server
   docker build -t gcr.io/whiteboard-479910/wb-app:latest .
   docker push gcr.io/whiteboard-479910/wb-app:latest
   ```
4. **Restart Kubernetes pods**:
   ```bash
   kubectl rollout restart deployment/app-a deployment/app-b
   ```
5. **Verify** pods are running:
   ```bash
   kubectl get pods -w
   ```
6. **Test** by opening the external IPs in your browser

## Troubleshooting

### Pods Not Running

```bash
# Check pod status
kubectl get pods

# Check logs
kubectl logs <pod-name>

# Describe pod for events
kubectl describe pod <pod-name>
```

### CouchDB Replication Issues

```bash
# Port-forward to CouchDB admin
kubectl port-forward svc/couchdb 5984:5984

# Open in browser: http://localhost:5984/_utils
# Username: admin
# Password: password
# Go to Replicator tab to check status
```

### WebSocket Connection Failed

Check if the app is running:
```bash
kubectl get pods -l app=app-a
kubectl logs <app-a-pod-name>
```

### Rebuild Everything from Scratch

```bash
# Delete all resources
kubectl delete deployment app-a app-b
kubectl delete statefulset couchdb
kubectl delete svc lb-a lb-b couchdb
kubectl delete pvc --all

# Reapply manifests
kubectl apply -f k8s/
```

### Check Database

```bash
# See all databases
kubectl exec -it couchdb-0 -- curl http://admin:password@localhost:5984/_all_dbs

# See documents in a room
kubectl exec -it couchdb-0 -- curl http://admin:password@localhost:5984/wb_room1/_all_docs
```

## Common Commands

```bash
# View all pods
kubectl get pods

# View services and external IPs
kubectl get svc

# View logs
kubectl logs <pod-name> -f

# Restart a deployment
kubectl rollout restart deployment/app-a

# Port-forward to a service
kubectl port-forward svc/couchdb 5984:5984

# SSH into a pod
kubectl exec -it <pod-name> -- /bin/bash

# Delete everything
kubectl delete all --all
```

## Tips for Collaboration

- **Always pull before pushing**: `git pull origin main`
- **Use descriptive commit messages**: `git commit -m "Fix pen tool delay"`
- **Test locally first**: `npm start` before pushing to production
- **Check Kubernetes logs** if something breaks: `kubectl logs <pod-name>`
- **Communicate with your team** before making breaking changes

## Support

For issues, check:
1. `kubectl logs` output
2. Browser console (F12)
3. CouchDB admin panel (`http://localhost:5984/_utils`)

