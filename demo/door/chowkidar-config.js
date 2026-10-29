/*
 * Copyright 2026 Ploutos Services LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* dvar's settings for the door's title bar (Chowkidar's js/chowkidar-bar-v6.js reads them). The shell is served
 * by the proxy beside the door; the environment is the realm's name; both houses belong to tenant Acme. */
window.CHOWKIDAR_ESTATE = {
  "cdn": "https://door.localhost:8443/cdn",
  "envColours": {"demo": "#134e4a"},
  "hosts": {"house-python.localhost:8443": "acme", "house-node.localhost:8443": "acme"},
  "icons": {},
  "names": {"house-python": "Python house", "house-node": "Node house"}
};
