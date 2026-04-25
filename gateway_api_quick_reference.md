# Gateway API - Quick Reference Card (CKA Exam)

## 1-Minute Setup

### Minimal HTTP Gateway
```yaml
---
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: my-gw-class
spec:
  controllerName: k8s.io/nginx-gateway
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gw
  namespace: default
spec:
  gatewayClassName: my-gw-class
  listeners:
    - name: http
      protocol: HTTP
      port: 80
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-route
  namespace: default
spec:
  parentRefs:
    - name: my-gw
  rules:
    - backendRefs:
        - name: my-service
          port: 8080
```

## Copy-Paste Templates

### 1. HTTPS with TLS
```yaml
# Create certificate secret first
kubectl create secret tls my-cert --cert=cert.crt --key=key.key -n default

---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: secure-gw
  namespace: default
spec:
  gatewayClassName: my-gw-class
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      hostname: example.com
      tls:
        mode: Terminate
        certificateRefs:
          - name: my-cert
            namespace: default
            kind: Secret
            group: core
```

### 2. Path-Based Routing
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: path-routes
spec:
  parentRefs:
    - name: my-gw
  rules:
    # Rule 1
    - matches:
        - path:
            type: PathPrefix
            value: "/api"
      backendRefs:
        - name: api-service
          port: 8080
    # Rule 2
    - matches:
        - path:
            type: PathPrefix
            value: "/"
      backendRefs:
        - name: web-service
          port: 80
```

### 3. Header Matching
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: header-route
spec:
  parentRefs:
    - name: my-gw
  rules:
    - matches:
        - headers:
            - name: X-User-Type
              value: admin
      backendRefs:
        - name: admin-service
          port: 8080
    - backendRefs:
        - name: default-service
          port: 8080
```

### 4. Weight-Based Load Balancing (Canary)
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: canary-route
spec:
  parentRefs:
    - name: my-gw
  rules:
    - backendRefs:
        - name: stable-service
          port: 8080
          weight: 90
        - name: canary-service
          port: 8080
          weight: 10
```

### 5. Request Header Modification
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: modify-headers
spec:
  parentRefs:
    - name: my-gw
  rules:
    - filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            add:
              X-Gateway: "kubernetes"
              X-Request-ID: "abc123"
            set:
              User-Agent: "Gateway/1.0"
            remove:
              - X-Debug
              - X-Secret
      backendRefs:
        - name: my-service
          port: 8080
```

### 6. HTTP to HTTPS Redirect
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: redirect-to-https
spec:
  parentRefs:
    - name: my-gw
      sectionName: http
  rules:
    - filters:
        - type: RequestRedirect
          requestRedirect:
            scheme: https
            statusCode: 301
      backendRefs:
        - name: dummy
          port: 80  # Won't be used
```

### 7. Cross-Namespace Gateway Access
```yaml
# Gateway in infrastructure namespace
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: shared-gw
  namespace: infrastructure
spec:
  gatewayClassName: my-gw-class
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: Selector
          selector:
            matchLabels:
              route-access: "true"

---
# Label the namespace
# kubectl label ns myapp route-access=true

---
# Route in different namespace
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-route
  namespace: myapp
spec:
  parentRefs:
    - name: shared-gw
      namespace: infrastructure
      sectionName: http
  rules:
    - backendRefs:
        - name: myapp-service
          namespace: myapp
          port: 8080
```

### 8. SNI with Multiple Certificates
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: multi-cert-gw
spec:
  gatewayClassName: my-gw-class
  listeners:
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        mode: Terminate
        certificateRefs:
          - name: default-cert
          - name: api-cert
          - name: admin-cert
```

## Critical Commands for Exam

### Status Checking
```bash
# Check all Gateway API resources
kubectl get gatewayclass
kubectl get gateway -A
kubectl get httproute -A

# Detailed status (shows why not accepted)
kubectl describe gateway my-gw
kubectl describe httproute my-route
kubectl describe gatewayclass my-class

# Watch for changes
kubectl get gateway -w
```

### Troubleshooting
```bash
# View resource YAML
kubectl get gateway my-gw -o yaml
kubectl get httproute my-route -o yaml

# Edit resources
kubectl edit gateway my-gw
kubectl patch gateway my-gw -p '{"spec":{"addresses":[{"type":"IPAddress","value":"192.0.2.1"}]}}'

# Delete resources
kubectl delete gateway my-gw
kubectl delete httproute my-route

# Check labels
kubectl get namespace --show-labels
kubectl get pod --show-labels -n default

# Verify service and endpoints
kubectl get svc my-service -o yaml
kubectl get endpoints my-service
```

### TLS Certificate Operations
```bash
# Create from files
kubectl create secret tls my-cert \
  --cert=path/to/cert.crt \
  --key=path/to/private.key \
  -n default

# View certificate details
kubectl get secret my-cert -o yaml
openssl x509 -in cert.crt -text -noout
openssl x509 -in cert.crt -noout -dates

# Test TLS connection
openssl s_client -connect gateway.example.com:443 -servername api.example.com
```

### Controller Logs
```bash
# NGINX Gateway logs
kubectl logs -n kube-system deploy/nginx-gateway -f

# Istio Gateway logs
kubectl logs -n istio-system deploy/istiod -f

# Check controller is running
kubectl get pods -n kube-system | grep -i gateway
```

## Key Things to Remember

### Resource Relationships
```
GatewayClass (cluster-scoped)
    ↓
Gateway (namespace-scoped) 
    ↓
HTTPRoute (namespace-scoped, must reference Gateway)
```

### Namespace Rules
| Resource | Scope | Notes |
|----------|-------|-------|
| GatewayClass | Cluster | Infrastructure template, one per controller type |
| Gateway | Namespace | Controls listeners, TLS, address allocation |
| HTTPRoute | Namespace | Define routing rules, reference Gateway via parentRefs |

### Match Logic (CRITICAL)
- ALL conditions in a `matches` block must be true (AND)
- Multiple match blocks mean any one can be true (OR)
- Rules are evaluated in order; first match wins
- A rule with no matches acts as a catch-all (default)

### Listener Rules
- One listener per (protocol, port, hostname) combination
- Multiple routes can attach to same listener
- `allowedRoutes` controls which routes can attach

### TLS Rules
- `mode: Terminate` = Gateway decrypts, backend gets plain HTTP
- `mode: Passthrough` = Backend handles TLS itself
- SNI matches hostname to certificate
- First cert in list is default fallback

## Common Mistakes (Avoid These!)

❌ WRONG: Parent ref with wrong namespace
```yaml
parentRefs:
  - name: my-gateway  # Gateway is in default, Route in myapp
```

✅ CORRECT:
```yaml
parentRefs:
  - name: my-gateway
    namespace: default  # Explicit namespace
```

---

❌ WRONG: Service in wrong namespace
```yaml
backendRefs:
  - name: my-service  # Is this in same namespace?
```

✅ CORRECT:
```yaml
backendRefs:
  - name: my-service
    namespace: default  # Explicit namespace
```

---

❌ WRONG: Listener name mismatch
```yaml
# Gateway
listeners:
  - name: http
    port: 80

# HTTPRoute
parentRefs:
  - name: my-gateway
    sectionName: https  # Wrong! listener is named "http"
```

✅ CORRECT:
```yaml
parentRefs:
  - name: my-gateway
    sectionName: http  # Matches listener name
```

---

❌ WRONG: Empty backend refs
```yaml
rules:
  - filters:
      - type: RequestRedirect
    backendRefs: []  # Empty!
```

✅ CORRECT:
```yaml
rules:
  - filters:
      - type: RequestRedirect
    backendRefs:
      - name: dummy  # Must have at least one
        port: 80
```

---

❌ WRONG: Match logic misunderstanding
```yaml
matches:
  - path:
      value: "/api"
    method: GET
  - method: POST
# This means: (path=/api AND method=GET) OR (method=POST)
```

✅ CORRECT (if you want both):
```yaml
matches:
  - path:
      value: "/api"
    method: GET
```

## Quick Diagnosis Flowchart

```
Route not working?
  ↓
kubectl describe httproute my-route
  ↓
Is "Accepted: True"? → YES → Is traffic reaching backend?
  ↓                              ↓
NO → Why?                   YES → Check match logic, filters
  ↓
ParentRef error? → Check Gateway exists, namespace correct
  ↓
AllowedRoutes error? → Check namespace labels match selector
  ↓
No parent found? → Check sectionName matches listener name
```

## Gateway Status Conditions to Check

```bash
kubectl describe gateway my-gw

# Look for these conditions:
Status:
  Conditions:
    - Type: Accepted
      Status: True           # Gateway is valid
    - Type: Programmed
      Status: True           # Controller has configured it
    - Type: Ready
      Status: True           # All listeners ready

# For HTTPRoute
kubectl describe httproute my-route

Status:
  RouteStatus:
    - ParentRef:
        Name: my-gateway
      Conditions:
        - Type: Accepted
          Status: True       # Route accepted by gateway
        - Type: ResolvedRefs
          Status: True       # Backends exist
```

## Command Shortcuts

```bash
# Approve all resources at once
kubectl apply -f gateway.yaml -f httproute.yaml -f service.yaml

# Watch gateway status
watch kubectl describe gateway my-gw

# Get all Gateway API resources
kubectl get gateways,httproutes,gatewayclass -A

# Export working config
kubectl get gateway my-gw -o yaml > gateway-export.yaml
```

## Exam Day Tips

1. **Always specify namespace explicitly** in cross-namespace scenarios
2. **Check parentRefs first** when route isn't accepted
3. **Understand the match logic**: ALL in block = AND, multiple blocks = OR
4. **TLS is at Gateway**, not at route level
5. **Backend refs need service to exist** with matching selectors
6. **Listener names matter** - use exact names in sectionName
7. **AllowedRoutes defaults to Same namespace** - change it if needed
8. **Weight values are relative**, not percentages (90:10 = 9:1)
9. **Filters run in order**, some are order-sensitive
10. **First matching rule wins**, order matters!

## Last-Minute Checklist Before Submitting

- [ ] GatewayClass controller name matches controller in cluster
- [ ] Gateway references correct GatewayClass
- [ ] HTTPRoute parentRefs reference correct Gateway
- [ ] All namespaces explicitly specified if cross-namespace
- [ ] Backend services exist and have pods running
- [ ] Pod labels match service selectors
- [ ] TLS certificates are in correct secret format
- [ ] Listener names match sectionNames in routes
- [ ] AllowedRoutes config allows the route to attach
- [ ] Status shows Accepted: True for all resources
