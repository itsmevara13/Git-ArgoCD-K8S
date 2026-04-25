# Kubernetes Gateway API - Complete CKA Study Guide

## Table of Contents
1. [Core Concepts](#core-concepts)
2. [GatewayClass](#gatewayclass)
3. [Gateway](#gateway)
4. [HTTPRoute](#httproute)
5. [TLS Configuration](#tls-configuration)
6. [Advanced Routing](#advanced-routing)
7. [CKA Exam Questions](#cka-exam-questions)
8. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
9. [Key Focus Areas for Exam](#key-focus-areas-for-exam)

---

## Core Concepts

### What is Gateway API?
- **Modern replacement for Ingress**: More expressive, extensible, role-oriented
- **Works with multiple controller types**: Nginx, Istio, AWS ALB, GCP Cloud Load Balancer, etc.
- **Kubernetes API standard**: As of v1.28, considered "generally available"
- **Resource-based architecture**: Uses CRDs (Custom Resource Definitions)

### Main Resources:
```
GatewayClass (Cluster-scoped) → Infrastructure template
    ↓
Gateway (Namespace-scoped) → Listener configuration + address
    ↓
Routes (HTTPRoute, TCPRoute, etc.) → Traffic matching rules
    ↓
Backend Services → Actual workloads
```

### Key Difference from Ingress:
| Feature | Ingress | Gateway API |
|---------|---------|------------|
| Scope | Single resource per cluster | Separated concerns (GatewayClass/Gateway/Route) |
| TLS | Basic cert management | Advanced SNI, multiple certs |
| Routing | Path/Host only | Path, host, method, headers, query params |
| Role-based | No | Yes (Infrastructure/Platform/App developers) |
| Status | Simple | Detailed conditions and reason codes |

---

## GatewayClass

### Definition
A GatewayClass defines which **controller** implementation will manage Gateways that reference it. Think of it as a template or "class" of gateways.

### Why needed?
- Multiple gateway implementations in same cluster (Nginx AND Istio)
- Each implementation has different capabilities
- Allows infrastructure teams to specify which controller is "approved"

### Example:
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx-gateway
spec:
  controllerName: k8s.io/nginx-gateway  # Exact controller ID from implementation
  description: "NGINX Gateway Controller"
  parametersRef:  # Optional: point to controller-specific config
    group: core
    kind: ConfigMap
    name: nginx-params
    namespace: kube-system
```

### Important Concepts:

**1. Controller Name**
- Must match exactly what the controller declares
- Examples:
  - `k8s.io/nginx-gateway`
  - `istio.io/gateway-controller`
  - `networking.gke.io/gke-gateway-controller`

**2. Parameters Reference (Optional)**
- Points to ConfigMap/Secret with controller-specific settings
- Only the referenced controller will read these

**3. Multiple GatewayClasses**
```yaml
---
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx-gateway
spec:
  controllerName: k8s.io/nginx-gateway
---
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: istio-gateway
spec:
  controllerName: istio.io/gateway-controller
---
# Apps choose which one to use
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: default
spec:
  gatewayClassName: nginx-gateway  # Uses NGINX, not Istio
```

---

## Gateway

### Definition
A Gateway defines:
- **Which GatewayClass** to use (determines controller)
- **Listeners** (ports, protocols, hostnames)
- **TLS configuration** (certificates)
- **Address allocation** (LoadBalancer, ClusterIP, etc.)

### Structure:
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: default  # Important: Gateway is namespace-scoped
spec:
  gatewayClassName: nginx-gateway  # References GatewayClass
  listeners:
    - name: http          # Listener name (must be unique per Gateway)
      protocol: HTTP      # Protocol: HTTP, HTTPS, TCP, UDP
      port: 80            # Port number
      hostname: "*.example.com"  # Optional: wildcard/specific hostnames
      allowedRoutes:      # Which Routes can attach to this listener
        namespaces:
          from: All       # All, Same, Selector
        kinds:
          - group: gateway.networking.k8s.io
            kind: HTTPRoute
      tls:                # TLS settings for HTTPS listeners
        mode: Terminate   # Terminate, Passthrough
        certificateRefs:
          - name: example-cert  # Secret name
            namespace: default
            group: core
            kind: Secret
    
    - name: https
      protocol: HTTPS
      port: 443
      hostname: "example.com"
      tls:
        mode: Terminate
        certificateRefs:
          - name: example-cert
```

### Address Allocation:
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
spec:
  gatewayClassName: nginx-gateway
  addresses:
    - type: IPAddress
      value: "192.0.2.1"
    # OR
    - type: Hostname
      value: "gateway.example.com"
  # OR let controller auto-assign:
  # Don't specify addresses - controller creates LoadBalancer Service
  listeners:
    - name: http
      protocol: HTTP
      port: 80
```

### Listener Details:

**Protocol Types:**
- `HTTP`: Clear text, port usually 80
- `HTTPS`: TLS encrypted, port usually 443
- `TCP`: Raw TCP (for non-HTTP), TLS or plain
- `UDP`: Raw UDP (limited support)
- `GRPC`: gRPC over HTTP/2
- `GRPCS`: gRPC over HTTP/2 + TLS

**Hostname Matching:**
```yaml
listeners:
  - name: prod-listener
    protocol: HTTPS
    port: 443
    hostname: "api.example.com"      # Exact match only
    
  - name: wildcard-listener
    protocol: HTTPS
    port: 8443
    hostname: "*.example.com"        # Wildcard (test.example.com matches)
```

**AllowedRoutes - Access Control:**
```yaml
listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      # From which namespaces can routes attach?
      namespaces:
        from: All              # Any namespace
        # OR:
        # from: Same           # Same namespace as Gateway
        # OR:
        # from: Selector
        #   matchLabels:
        #     environment: prod
      
      # Which route kinds?
      kinds:
        - group: gateway.networking.k8s.io
          kind: HTTPRoute
```

---

## HTTPRoute

### Definition
HTTPRoute defines how HTTP traffic reaching a Gateway listener should be routed to backend services.

### Basic Structure:
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: default
spec:
  # 1. Which Gateway(s) does this route attach to?
  parentRefs:
    - name: my-gateway
      namespace: default     # If different namespace
      sectionName: http      # Attach to specific listener
  
  # 2. Which traffic to match?
  hostnames:
    - "api.example.com"
    - "*.example.com"
  
  # 3. Routing rules
  rules:
    - matches:        # ALL conditions must match (AND logic)
        - path:
            type: PathPrefix  # PathPrefix, Exact, RegularExpression
            value: "/api/v1"
          method: POST
          headers:
            - name: X-User-Type
              value: premium
          queryParams:
            - name: debug
              value: "true"
      
      # Where to send matching traffic
      backendRefs:
        - name: api-service
          port: 8080
          weight: 100    # For load balancing between backends
      
      # Add/modify request/response
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add:
              X-Request-ID: "abc123"
            remove:
              - X-Debug
        - type: ResponseHeaderModifier
          responseHeaderModifier:
            add:
              X-Backend: "api-v1"
      
      # Timeout and retry
      timeouts:
        request: 30s
        backendRequest: 10s
      
      backendRequest: 10s    # Timeout for request to backend
```

### Complete Real-World Example:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: default
spec:
  selector:
    app: frontend
  ports:
    - port: 80
      targetPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: default
spec:
  selector:
    app: api
  ports:
    - port: 8080
      targetPort: 8080
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-routes
  namespace: default
spec:
  parentRefs:
    - name: my-gateway
      sectionName: https
  
  hostnames:
    - "example.com"
    - "www.example.com"
  
  rules:
    # Rule 1: API traffic
    - matches:
        - path:
            type: PathPrefix
            value: "/api"
      backendRefs:
        - name: api-service
          port: 8080
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add:
              X-From: gateway
    
    # Rule 2: Static content
    - matches:
        - path:
            type: PathPrefix
            value: "/"
      backendRefs:
        - name: frontend-service
          port: 80
```

### Match Types:

**Path Matching:**
```yaml
matches:
  - path:
      type: Exact            # Exact string match
      value: "/login"
  - path:
      type: PathPrefix       # Prefix match
      value: "/api"          # Matches /api, /api/v1, /api/v1/users
  - path:
      type: RegularExpression
      value: "^/api/v[0-9]"
```

**Header Matching:**
```yaml
matches:
  - headers:
      - name: User-Agent
        value: Chrome       # Simple value match
      - name: Authorization
        value: Bearer.*     # (with RegularExpression type)
```

**Query Parameter Matching:**
```yaml
matches:
  - queryParams:
      - name: debug
        value: "true"
      - name: version
        value: "v[0-9]+"
```

**Method Matching:**
```yaml
matches:
  - method: GET
  - method: POST
  - method: PUT
  - method: DELETE
```

### Weight-Based Load Balancing:
```yaml
rules:
  - matches:
      - path:
          type: PathPrefix
          value: "/api"
    backendRefs:
      - name: api-v1
        port: 8080
        weight: 70
      - name: api-v2
        port: 8080
        weight: 30    # 70% traffic to v1, 30% to v2
```

### Filters (Request/Response Modification):

**RequestHeaderModifier:**
```yaml
filters:
  - type: RequestHeaderModifier
    requestHeaderModifier:
      add:
        X-Custom: "value"
        X-Gateway: "nginx"
      set:
        User-Agent: "MyGateway/1.0"
      remove:
        - X-Debug
        - Authorization  # Sensitive data removal
```

**ResponseHeaderModifier:**
```yaml
filters:
  - type: ResponseHeaderModifier
    responseHeaderModifier:
      add:
        Cache-Control: "public, max-age=3600"
        X-Backend-Version: "v1.2.3"
      remove:
        - Server
```

**RequestRedirect:**
```yaml
filters:
  - type: RequestRedirect
    requestRedirect:
      scheme: https
      statusCode: 301      # Permanent redirect
      hostname: "example.com"
      path:
        type: ReplaceFullPath
        replaceFullPath: "/new-path"
```

**URLRewrite:**
```yaml
filters:
  - type: URLRewrite
    urlRewrite:
      path:
        type: ReplacePrefixMatch
        replacePrefixMatch: "/api/v2"  # /api/v1/* → /api/v2/*
```

---

## TLS Configuration

### Listener TLS Setup:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: secure-gateway
spec:
  gatewayClassName: nginx-gateway
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      hostname: "*.example.com"
      tls:
        mode: Terminate        # Gateway terminates TLS
        certificateRefs:
          - name: wildcard-cert
            namespace: default
            group: core
            kind: Secret
        # Optional: minimum TLS version
        options:
          core.k8s.io/tls-version: "1.2"
```

### Certificate Secret Format:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: example-cert
  namespace: default
type: kubernetes.io/tls
data:
  tls.crt: <base64-encoded-certificate>
  tls.key: <base64-encoded-private-key>
```

### Create certificate secret:
```bash
# From files
kubectl create secret tls example-cert \
  --cert=path/to/cert.crt \
  --key=path/to/private.key \
  -n default

# Verify
kubectl get secret example-cert -o yaml
kubectl describe secret example-cert
```

### TLS Modes:

**1. Terminate (Default):**
```yaml
tls:
  mode: Terminate
  certificateRefs:
    - name: example-cert
```
- Gateway decrypts incoming TLS
- Connections to backend are plain HTTP
- Gateway adds security headers via filters

**2. Passthrough:**
```yaml
tls:
  mode: Passthrough
```
- Gateway doesn't terminate TLS
- Raw TLS traffic passed to backend
- Backend must handle TLS
- Use for: TCP traffic, backend wants to handle certs itself

### SNI (Server Name Indication) - Multiple Certificates:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: multi-cert-gateway
spec:
  gatewayClassName: nginx-gateway
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          # First cert is default
          - name: example-cert
            namespace: default
          # Additional certs for SNI
          - name: api-cert
            namespace: default
          - name: admin-cert
            namespace: default
  
  # HTTPRoute with specific hostname → uses matching cert
  rules:
    - hostnames:
        - "example.com"
      # Uses example-cert
      backendRefs:
        - name: www-service
```

HTTPRoute matches hostname to determine which cert:
- `example.com` → uses `example-cert`
- `api.example.com` → uses `api-cert`
- Other → uses first (default) cert

### Common TLS Issues & Solutions:

**Issue: Certificate not working**
```bash
# Verify cert is in correct Secret format
kubectl get secret example-cert -o yaml | grep tls.crt

# Check certificate validity
openssl x509 -in cert.crt -text -noout
openssl x509 -in cert.crt -noout -dates

# Verify Gateway is reading the cert
kubectl describe gateway secure-gateway
```

**Issue: Wrong certificate for hostname**
- Check SNI matching in controller docs
- Verify hostnames in HTTPRoute match certificate CN/SAN
- Use first cert in list as fallback

**Issue: TLS handshake failures**
- Check TLS version settings match client requirements
- Verify cipher suites if controller allows configuration

---

## Advanced Routing

### Header-Based Routing:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: advanced-routing
spec:
  parentRefs:
    - name: my-gateway
  
  rules:
    # Route premium users to faster backend
    - matches:
        - headers:
            - name: X-User-Tier
              value: premium
      backendRefs:
        - name: premium-api
          port: 8080
    
    # Route internal users to internal backend
    - matches:
        - headers:
            - name: X-Internal-Request
              value: "true"
      backendRefs:
        - name: internal-api
        filters:
          - type: RequestHeaderModifier
            requestHeaderModifier:
              add:
                X-Origin: internal
    
    # Default route
    - backendRefs:
        - name: public-api
          port: 8080
```

### Canary Deployments:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: canary-route
spec:
  parentRefs:
    - name: my-gateway
  
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: "/api"
      backendRefs:
        # 95% to stable version
        - name: api-stable
          port: 8080
          weight: 95
        # 5% to canary version
        - name: api-canary
          port: 8080
          weight: 5
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add:
              X-Backend-Version: "canary"
```

### Redirect HTTP to HTTPS:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: redirect-gateway
spec:
  listeners:
    - name: http
      protocol: HTTP
      port: 80
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: example-cert
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: redirect-http-to-https
spec:
  parentRefs:
    - name: redirect-gateway
      sectionName: http
  
  rules:
    - filters:
        - type: RequestRedirect
          requestRedirect:
            scheme: https
            statusCode: 301
      backendRefs:
        - name: dummy  # Won't be used due to redirect
```

### Path-Based Microservices Routing:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: microservices-routing
spec:
  parentRefs:
    - name: my-gateway
  
  hostnames:
    - "api.example.com"
  
  rules:
    # Users service
    - matches:
        - path:
            type: PathPrefix
            value: "/users"
      backendRefs:
        - name: users-service
          port: 3000
      filters:
        - type: URLRewrite
          urlRewrite:
            path:
              type: ReplacePrefixMatch
              replacePrefixMatch: "/api"
    
    # Orders service
    - matches:
        - path:
            type: PathPrefix
            value: "/orders"
      backendRefs:
        - name: orders-service
          port: 3000
    
    # Payments service
    - matches:
        - path:
            type: PathPrefix
            value: "/payments"
      backendRefs:
        - name: payments-service
          port: 3000
    
    # Analytics service
    - matches:
        - path:
            type: PathPrefix
            value: "/analytics"
      backendRefs:
        - name: analytics-service
          port: 4000
```

---

## CKA Exam Questions

### Question 1: Basic Setup (Easy)
**Scenario:**
You need to expose a web application running in the default namespace on port 80 with HTTP.

**Task:**
1. Create a GatewayClass named "simple-gateway" using nginx-gateway controller
2. Create a Gateway named "web-gateway" using this class
3. Create an HTTPRoute that routes traffic from "app.example.com" to a service named "web-app" on port 80

**Solution:**
```yaml
# GatewayClass
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: simple-gateway
spec:
  controllerName: k8s.io/nginx-gateway

---
# Gateway
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-gateway
  namespace: default
spec:
  gatewayClassName: simple-gateway
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: All

---
# HTTPRoute
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: default
spec:
  parentRefs:
    - name: web-gateway
      sectionName: http
  
  hostnames:
    - app.example.com
  
  rules:
    - backendRefs:
        - name: web-app
          port: 80
```

---

### Question 2: TLS Configuration (Medium)
**Scenario:**
Secure the application with HTTPS. You have a certificate and key file.

**Task:**
1. Create a TLS secret from certificate files
2. Update the Gateway to listen on HTTPS port 443
3. Configure TLS termination with the certificate
4. Ensure HTTP to HTTPS redirect

**Solution:**
```bash
# Create TLS secret
kubectl create secret tls app-cert \
  --cert=path/to/cert.crt \
  --key=path/to/private.key \
  -n default
```

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: secure-gateway
  namespace: default
spec:
  gatewayClassName: simple-gateway
  listeners:
    # HTTP listener for redirect
    - name: http
      protocol: HTTP
      port: 80
    
    # HTTPS listener with TLS
    - name: https
      protocol: HTTPS
      port: 443
      hostname: "app.example.com"
      tls:
        mode: Terminate
        certificateRefs:
          - name: app-cert
            namespace: default
            kind: Secret
            group: core

---
# HTTP to HTTPS redirect
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: http-to-https
  namespace: default
spec:
  parentRefs:
    - name: secure-gateway
      sectionName: http
  
  rules:
    - filters:
        - type: RequestRedirect
          requestRedirect:
            scheme: https
            statusCode: 301
      backendRefs:
        - name: dummy-service
          port: 80

---
# HTTPS route
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: secure-route
  namespace: default
spec:
  parentRefs:
    - name: secure-gateway
      sectionName: https
  
  hostnames:
    - app.example.com
  
  rules:
    - backendRefs:
        - name: web-app
          port: 80
```

---

### Question 3: Advanced Routing (Medium)
**Scenario:**
Route API traffic to different backends based on path and headers.

**Task:**
1. Route `/api/v1/*` to api-v1 service
2. Route `/api/v2/*` to api-v2 service
3. Add header "X-API-Version" to all requests
4. Implement canary: 80% traffic to production, 20% to staging

**Solution:**
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-routes
  namespace: default
spec:
  parentRefs:
    - name: secure-gateway
      sectionName: https
  
  hostnames:
    - api.example.com
  
  rules:
    # API v1 routes
    - matches:
        - path:
            type: PathPrefix
            value: "/api/v1"
      backendRefs:
        - name: api-v1-prod
          port: 8080
          weight: 80
        - name: api-v1-staging
          port: 8080
          weight: 20
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add:
              X-API-Version: "1"
    
    # API v2 routes
    - matches:
        - path:
            type: PathPrefix
            value: "/api/v2"
      backendRefs:
        - name: api-v2-prod
          port: 8080
          weight: 80
        - name: api-v2-staging
          port: 8080
          weight: 20
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add:
              X-API-Version: "2"
```

---

### Question 4: Cross-Namespace Routing (Hard)
**Scenario:**
Your application spans multiple namespaces. Configure appropriate access control.

**Task:**
1. Create a Gateway in the "infrastructure" namespace
2. Create HTTPRoutes in "app-a" and "app-b" namespaces
3. Ensure routes can only attach to the Gateway if explicitly allowed
4. Set up proper namespace isolation

**Solution:**
```yaml
# In infrastructure namespace
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: shared-gateway
spec:
  controllerName: k8s.io/nginx-gateway

---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: central-gateway
  namespace: infrastructure
spec:
  gatewayClassName: shared-gateway
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      # Allow routes from app-a and app-b namespaces only
      allowedRoutes:
        namespaces:
          from: Selector
          selector:
            matchLabels:
              route-access: "true"

---
# Label namespaces for access control
# kubectl label namespace app-a route-access=true
# kubectl label namespace app-b route-access=true

---
# In app-a namespace
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-a-route
  namespace: app-a
spec:
  parentRefs:
    - name: central-gateway
      namespace: infrastructure
      sectionName: http
  
  hostnames:
    - app-a.example.com
  
  rules:
    - backendRefs:
        - name: app-a-service
          namespace: app-a
          port: 8080

---
# In app-b namespace
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-b-route
  namespace: app-b
spec:
  parentRefs:
    - name: central-gateway
      namespace: infrastructure
      sectionName: http
  
  hostnames:
    - app-b.example.com
  
  rules:
    - backendRefs:
        - name: app-b-service
          namespace: app-b
          port: 8080
```

---

### Question 5: Troubleshooting (Hard)
**Scenario:**
An HTTPRoute isn't routing traffic correctly. Diagnose and fix the issue.

**Task:**
Debug and list potential issues to check:

**Common Issues & Diagnostics:**
```bash
# 1. Check if GatewayClass exists and controller is running
kubectl get gatewayclass
kubectl get pods -n kube-system | grep -i gateway

# 2. Check Gateway status
kubectl describe gateway my-gateway
# Look for "Listeners" section and any warning messages

# 3. Check HTTPRoute status
kubectl describe httproute my-route
# Look for "Parent Ref Status" - is it accepted?
# Check "Route Status" for Accepted condition

# 4. Check if parentRef is correct
kubectl get gateway -A
# Verify namespace and name match exactly

# 5. Check listener name in parentRef
kubectl get gateway my-gateway -o yaml | grep -A10 "listeners:"

# 6. Check backend service exists
kubectl get svc web-app -n default
kubectl describe svc web-app

# 7. View Gateway logs
kubectl logs -n kube-system deploy/nginx-gateway -f

# 8. Check TLS certificate
kubectl get secret app-cert -o yaml
openssl x509 -in cert.crt -text -noout

# Full debugging example
kubectl get httproute -A
kubectl describe httproute my-route -n default
kubectl get gateway -n default
kubectl get gatewayclass
```

**Example of a bad HTTPRoute:**
```yaml
# WRONG - namespace mismatch
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: bad-route
  namespace: app-a
spec:
  parentRefs:
    - name: my-gateway      # Lives in default, not app-a
      sectionName: http
  rules:
    - backendRefs:
        - name: web-app
          port: 80

# CORRECT
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: good-route
  namespace: app-a
spec:
  parentRefs:
    - name: my-gateway
      namespace: default    # Explicitly specify if different
      sectionName: http
  rules:
    - backendRefs:
        - name: web-app
          namespace: app-a  # Also specify backend namespace
          port: 80
```

---

## Common Issues & Troubleshooting

### Issue 1: Gateway Status Pending
```yaml
# Check what's wrong
kubectl describe gateway my-gateway

# Possible causes:
# - LoadBalancer service pending IP assignment
#   Solution: Provide explicit address or wait for cloud load balancer
# - Controller not running or not watching this GatewayClass
#   Solution: Check controller logs, ensure controllerName matches

# Fix by providing address:
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
spec:
  gatewayClassName: nginx-gateway
  addresses:
    - type: IPAddress
      value: "192.0.2.1"
  # OR
  addresses:
    - type: Hostname
      value: "gateway.example.com"
```

### Issue 2: HTTPRoute Not Accepted
```bash
kubectl describe httproute my-route

# Check for: "Accepted: False"
# Common reasons:

# 1. Parent Gateway doesn't exist
kubectl get gateway -n default my-gateway

# 2. Parent ref pointing to wrong namespace
kubectl get gateway -n infrastructure
# If Gateway is in infrastructure namespace:
parentRefs:
  - name: my-gateway
    namespace: infrastructure

# 3. Listener name doesn't match
kubectl get gateway my-gateway -o yaml | grep "name:"

# 4. Route namespace not allowed
kubectl describe gateway my-gateway
# Check "allowedRoutes" settings
```

### Issue 3: TLS Not Working
```bash
# Verify certificate secret exists and is valid
kubectl get secret app-cert -o yaml

# Check certificate details
openssl x509 -in cert.crt -text -noout | grep -A2 "Subject:"
openssl x509 -in cert.crt -noout -dates

# Verify Gateway references correct secret
kubectl describe gateway my-gateway | grep -A5 "tls:"

# Test TLS connection
openssl s_client -connect gateway.example.com:443 -servername api.example.com
```

### Issue 4: Traffic Not Reaching Backend
```bash
# 1. Check HTTPRoute matches requests
kubectl describe httproute my-route
# Verify matches section matches your requests

# 2. Check backend service exists and has endpoints
kubectl get svc api-service
kubectl get endpoints api-service

# 3. Check service selector labels
kubectl get pods --show-labels
# Verify pod labels match service selector

# 4. Check Gateway is listening
kubectl get svc -l app=nginx-gateway -n kube-system
# Should show EXTERNAL-IP assigned

# 5. Test DNS resolution
nslookup gateway.example.com
dig api.example.com

# 6. Test direct backend connectivity
kubectl exec -it <pod> -- curl http://api-service:8080/health
```

---

## Key Focus Areas for Exam

### 1. Resource Relationships (CRITICAL)
```
Understand the strict hierarchy:
GatewayClass (1) → Gateway (N) → HTTPRoute (N)
    ↓                  ↓              ↓
Controller      Listeners      Matching + routing
  template        (Ports)          (Rules)
```

**Exam focus:** Know which can be cross-namespace, which are namespace-scoped

### 2. Listener Configuration
- [ ] Understand all protocol types: HTTP, HTTPS, TCP, UDP, GRPC, GRPCS
- [ ] TLS modes: Terminate vs Passthrough
- [ ] AllowedRoutes: Namespaces (All/Same/Selector) and Kinds
- [ ] Hostname matching: exact vs wildcard
- [ ] Multiple listeners per Gateway

### 3. HTTPRoute Matching (Most Common Exam Topic)
- [ ] ALL matches use AND logic
- [ ] Path types: Exact, Prefix, RegularExpression
- [ ] Header, method, query param matching
- [ ] Match specificity determines routing order
- [ ] Default rule (no matches) acts as catch-all

### 4. TLS Configuration
- [ ] Secret format: tls.crt + tls.key
- [ ] Creating secrets from files
- [ ] SNI matching with multiple certificates
- [ ] TLS version/cipher options
- [ ] Certificate validation and troubleshooting

### 5. Routing Filters
- [ ] RequestHeaderModifier: add/set/remove
- [ ] ResponseHeaderModifier
- [ ] RequestRedirect: for HTTPS redirects
- [ ] URLRewrite: path manipulation
- [ ] Filter execution order

### 6. Status and Conditions
```bash
# Always check status first for troubleshooting
kubectl describe gateway my-gateway
kubectl describe httproute my-route
kubectl describe gatewayclass my-class

# Look for:
# - Accepted: True/False (with reasons)
# - Scheduled: True/False
# - Ready: True/False
```

### 7. Cross-Namespace Routing
- [ ] Gateway in one namespace, Routes in others
- [ ] Parent ref must include namespace
- [ ] AllowedRoutes controls which namespaces can attach
- [ ] Selector-based access control with labels

### 8. Practical Scenarios (Likely Exam Questions)
1. Set up basic HTTP routing
2. Add HTTPS with TLS termination
3. Redirect HTTP to HTTPS
4. Route based on path (microservices)
5. Route based on headers (canary/user type)
6. Weight-based load balancing (canary)
7. Debug non-working Gateway
8. Fix HTTPRoute not being accepted
9. Certificate issues with TLS
10. Cross-namespace routing configuration

---

## Quick Reference Commands

```bash
# View resources
kubectl get gatewayclass
kubectl get gateway -A
kubectl get httproute -A
kubectl get tcproute -A
kubectl get service -A

# Detailed status
kubectl describe gatewayclass my-class
kubectl describe gateway my-gateway -n default
kubectl describe httproute my-route -n default

# Create resources
kubectl apply -f gateway.yaml
kubectl create -f httproute.yaml

# Edit resources
kubectl edit gateway my-gateway
kubectl patch httproute my-route -p '{"spec":{"rules":[...]}}'

# Delete resources
kubectl delete gateway my-gateway
kubectl delete httproute my-route

# Get YAML
kubectl get gateway my-gateway -o yaml
kubectl get httproute my-route -o yaml

# Labels and selectors
kubectl label namespace app-a gateway-access=true
kubectl label pod my-pod tier=premium

# View events
kubectl get events -n default
kubectl describe gateway my-gateway | grep -A20 "Events:"

# Logs
kubectl logs -n kube-system deploy/nginx-gateway
kubectl logs -n kube-system deploy/istio-ingressgateway

# Debugging
kubectl exec -it <pod> -- curl http://service:port/
openssl s_client -connect gateway.example.com:443
```

---

## Summary Table: Ingress vs Gateway API

| Feature | Ingress | Gateway API |
|---------|---------|------------|
| **Maturity** | Stable | GA (v1.28+) |
| **Controller Template** | No GatewayClass | GatewayClass |
| **TLS Certs** | Basic | Advanced (SNI) |
| **Path Routing** | / prefix | Prefix/Exact/Regex |
| **Header Routing** | No | Yes |
| **Query Matching** | No | Yes |
| **Method Routing** | No | Yes |
| **Redirects** | Limited | Full support |
| **Header Modification** | Limited | Full add/set/remove |
| **Weight Distribution** | No | Yes (backend weights) |
| **Role-Based** | No | Yes |
| **Cross-Namespace** | Complex | Designed-in |
| **Status Details** | Simple | Detailed conditions |

---

## Final Tips for CKA Exam

1. **Always check resource names and namespaces** - Mismatched namespace or name = not accepted
2. **Understand parentRefs** - Most common mistake is wrong namespace reference
3. **Know the match logic** - ALL conditions in matches array must match (AND)
4. **Test TLS certificates** - Know how to validate certificate secrets
5. **Check status first** - `describe` command shows why resource isn't working
6. **Understand controller vs Gateway** - GatewayClass = which controller, Gateway = listener config
7. **Know filter order** - Filters execute in spec order, some are order-sensitive
8. **Wildcard hostnames** - `*.example.com` matches subdomains but not apex domain
9. **Default routes** - Rules with no matches catch everything (last rule)
10. **TLS passthrough use case** - Needed when backend handles its own TLS

---

## Additional Resources to Review

- Official Kubernetes Gateway API docs: https://gateway.api.k8s.io
- Specific controller documentation (NGINX, Istio, etc.)
- Practice with `kubectl explain` command:
  ```bash
  kubectl explain gateway
  kubectl explain httproute.spec.rules
  kubectl explain gateway.spec.listeners
  ```

Good luck with your CKA exam! The Gateway API knowledge will definitely be tested.
