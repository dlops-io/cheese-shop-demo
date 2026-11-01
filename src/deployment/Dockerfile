# The tools for the local cluster, so Docker is the only thing the laptop needs.
# Built for this machine's architecture: kind's nodes take it from the host, and emulation would
# spoil the CPU numbers the autoscaler reads.
FROM debian:trixie-slim

ARG TARGETARCH
ARG KIND_VERSION=v0.33.0
ARG KUBECTL_VERSION=v1.37.1

RUN case "${TARGETARCH}" in amd64|arm64) ;; *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; esac
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash-completion ca-certificates curl gnupg procps \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=${TARGETARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian trixie stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSLo /tmp/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
    && curl -fsSLo /tmp/kubectl.sha256 "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl.sha256" \
    && echo "$(cat /tmp/kubectl.sha256)  /tmp/kubectl" | sha256sum --check \
    && install -m 0755 /tmp/kubectl /usr/local/bin/kubectl \
    && rm /tmp/kubectl /tmp/kubectl.sha256
RUN cd /tmp \
    && curl -fsSLO "https://github.com/kubernetes-sigs/kind/releases/download/${KIND_VERSION}/kind-linux-${TARGETARCH}" \
    && curl -fsSLO "https://github.com/kubernetes-sigs/kind/releases/download/${KIND_VERSION}/kind-linux-${TARGETARCH}.sha256sum" \
    && sha256sum --check "kind-linux-${TARGETARCH}.sha256sum" \
    && install -m 0755 "kind-linux-${TARGETARCH}" /usr/local/bin/kind \
    && rm kind-linux-*

WORKDIR /app

# The entrypoint runs from the bind-mounted /app, so editing it needs no rebuild
ENTRYPOINT ["/bin/bash", "./docker-entrypoint.sh"]
