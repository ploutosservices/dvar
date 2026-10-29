# dvar

*Dvar* (द्वार) is a door. This is a recipe for a platform's front door that several independent
applications share. It has three parts:

- an **identity provider** with single sign-on ([Keycloak](https://www.keycloak.org/) with
  [Chowkidar](https://github.com/ploutosservices/chowkidar) built in);
- a **reverse proxy** that holds TLS and tells a service who is calling (nginx);
- a **shared application shell**: one title bar, coloured by environment, that every application wears.

None of the parts is new. What is published is the assembly, and the rules under which an application joins
it. Why it is shaped this way is in [the essay](docs/dvar.md).

## Words used here

| Word | Meaning |
|---|---|
| **house** | an application behind the door. It keeps its own data and decides alone who may use it |
| **door** | the identity provider every house signs its people in at (here Keycloak with Chowkidar) |
| **pass** | the signed-in session the door gives a person; every house reads it the same way |
| **the bar** | the title bar every house wears: house, tenant and environment, in the environment's colour |
| **tenant** | the customer a house is serving on this page (the demo has one, Acme) |
| **utility** | a service that serves houses, never people: here bhandara (files) and dakiya (mail) |
| **environment** | which world this is (production, staging, a demo). Here it is the door's realm name, `demo` |
| **estate** | the set of houses behind one door |
| **neenv** | the prepared ground dvar stands on (below) |

## 1. Prepare the neenv

**For a trial, the demo prepares a small neenv for you: go straight to [Try it](#2-try-it).** The list
below is for a real deployment.

*Neenv* (नींव) is the foundation poured before any wall. Dvar is installed only on prepared ground; check
that each of these is true first:

- machines and a network;
- DNS for every name the door and the houses answer to;
- a certificate authority whose root every machine trusts (the passes depend on it);
- a reverse proxy;
- PostgreSQL;
- a public domain for the door's address.

[The essay's chapter on neenv](docs/dvar.md#neenv-the-ground-it-stands-on) says what each one carries.

## 2. Try it

You need Docker with Compose. Run it from this published tree: `shell/` is part of it, put here by the
publish step from the shell's source. The demo refuses to start without it.

    cp .env.example .env               # replace every CHANGEME: openssl rand -hex 16 makes each value
    docker compose up --build -d

The demo refuses to start while any CHANGEME is left. It listens on 127.0.0.1 only.

**In a browser.** Open `https://house-python.localhost:8443/`. Chrome, Edge and Firefox resolve any
`*.localhost` name to your own machine. Safari and `curl` may not: add the five names (`door`, `house-python`,
`house-node`, `bhandara` and `dakiya`, each `.localhost`) to `/etc/hosts` as 127.0.0.1, or use
`curl --resolve`. The certificates come from the demo's own CA. To trust it, copy it out of the volume with
`docker compose cp certs:/certs/ca.pem ./ca.pem` (this works after the `certs` step has exited) and add
`ca.pem` to your browser. Otherwise the browser warns once for each name you visit: the house, then the door.

The first screen is the door's sign-in page under the bar: *Python house · Acme · DEMO*. Sign in as `demo`
with the `DEMO_PERSON_PASSWORD` you chose. You land on the Python house. Then:

- open the Node house from the bar's link: you are signed in already, under the same bar;
- upload a file through bhandara, and send a mail through dakiya. The mail lands in the sink at
  `http://127.0.0.1:8025`. Outside production, dakiya sends every mail to the tenant's own address;
- sign out of one house: the door ends your session in the other too.

**The end-to-end test** walks the same path and checks each step:

    docker compose run --build --rm tests
    docker compose down -v

**What leaves your machine:** nothing while the demo runs, apart from the builds fetching images and the
three repositories. The weather slot is off. Set `HOUSE_WEATHER=on` in `.env` and a visitor who clicks it sends
their location to Open-Meteo, Nominatim and NOAA (see `NOTICE`; Open-Meteo's free tier is non-commercial).

## Not for production

The demo trades safety for one command:

- Keycloak runs in development mode (`start-dev`), its store inside the container;
- both PostgreSQL servers trust every connection on the demo's network;
- the S3 store accepts any key;
- every certificate is valid for two days, from a CA whose key sits in a Docker volume;
- everything is published on 127.0.0.1 only. Keep it that way.

**The one trust boundary is the proxy.** It asks for a client certificate (`ssl_verify_client optional`).
It then sets the identity header from a verified certificate, and clears it on every request without one
(the `map` in `demo/nginx.conf`). A utility believes that header, so a utility must never be reachable
except through the proxy. dakiya listens on a socket only the proxy shares. bhandara listens on the demo's
internal network and publishes no port.

## What is in it

| Path | What it is |
|---|---|
| `shell/` | the shell: the bar (`estate/titlebar/`), tables, forms, icons, tips, hover cards, print corners and the weather slot |
| `houses/python/`, `houses/node/` | two sample houses, one per language, to show the rules are language-neutral |
| `demo/` | the demo's neenv (`make-certs.py`, `nginx.conf`), the door image (`door/`), the start check (`preflight.py`) and the one-time seed (`seed.py`) |
| `tests/e2e.py` | the end-to-end test |
| `docs/dvar.md` | the essay |

`shell/estate/titlebar/titlebar.css` draws the bar. `titlebar.js` does two things: it fills the weather slot
when a house has one, and it turns the bar's greeting into good morning, afternoon or evening. Both houses
load both files.

Chowkidar, [bhandara](https://github.com/ploutosservices/bhandara) (files) and
[dakiya](https://github.com/ploutosservices/dakiya) (mail) are built from their own repositories. Set
`CHOWKIDAR_CONTEXT`, `BHANDARA_CONTEXT` or `DAKIYA_CONTEXT` in `.env` to build from a local checkout. The door
shows its password form here because the demo realm has no Google or Microsoft button. Chowkidar's own
theme hides that form from people elsewhere (`demo/door/login-theme.properties`).

## How a house joins (the accession)

**Required** (a house that skips one of these is not behind the door):

1. **Sign in only at the door.** A house is an OIDC client in the door's realm. The house alone decides who
   its customers are; the door only proves who you are.
2. **Wear the bar.** The fixed HTML skeleton (see either house's page) and the unversioned
   `shell/estate/titlebar/titlebar.css`. The colour comes from the house's declared environment. A house that
   declares none sets no colour, and the bar shows its "undeclared" red (`--estate-env-undeclared` in
   `titlebar.css`), never production's.
3. **Sign-out reaches the house.** The door calls each house's back-channel logout. A house believes a logout
   token only when the door signed it, then ends the matching session.
4. **The house declares itself.** A small JSON at `/manifest.json`: its environment, its version and its
   health door.

**Optional** (a house may decline each):

5. **The weather slot.** One element in the bar's actions, filled by `titlebar.js`. Off in both houses here.
6. **Print.** Dvar ships no print control. A house plugs its own print action into the bar's actions.
   `shell/estate/print/` writes the printed sheet's corners (tenant, title, address, page N of M). Dvar expects
   a house to offer print, but does not require it.
7. **A footer** with the house's declared version, at the foot of the page.

**Utilities join differently.** A house reaches bhandara or dakiya with its own client certificate, never
with the person's pass, through the proxy (above).

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
