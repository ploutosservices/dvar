# Copyright 2026 Ploutos Services LLC
# SPDX-License-Identifier: Apache-2.0
# The door: Keycloak with Chowkidar built in (its extension, its theme, its generic realm), wearing dvar's
# settings. `chowkidar` is a named build context (docker-compose.yml: CHOWKIDAR_CONTEXT), Chowkidar's tree.
FROM maven:3.9.9-eclipse-temurin-21@sha256:3a4ab3276a087bf276f79cae96b1af04f53731bec53fb2e651aca79e4b10211e AS extension
WORKDIR /src
COPY --from=chowkidar passkey-extension/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY --from=chowkidar passkey-extension/src src
RUN mvn -B -q -DskipTests package

FROM quay.io/keycloak/keycloak:26.4.4
COPY --from=extension /src/target/chowkidar-passkey.jar /opt/keycloak/providers/chowkidar-passkey.jar
COPY --from=chowkidar themes/chowkidar /opt/keycloak/themes/chowkidar
COPY --from=chowkidar realm /opt/keycloak/data/import
# dvar's settings for the sign-in page's bar, in place of Chowkidar's own example
COPY demo/door/chowkidar-config.js /opt/keycloak/themes/chowkidar/login/resources/js/chowkidar-config.js
# and its theme properties: the demo realm has no identity provider, so its password form stays visible
COPY demo/door/login-theme.properties /opt/keycloak/themes/chowkidar/login/theme.properties
RUN /opt/keycloak/bin/kc.sh build --health-enabled=true
