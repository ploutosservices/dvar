# Dvar: a door for houses that keep their own rule

*Umesh Mittal*

## A facade, and a pass

An estate of applications needs a way in. Its author describes it as *"a facade or darwaza as we called it in
my native country. it lets people in the estate and gives us a pass to move around … and then we get inside
various homes (apps)"*. (*Darwaza* is Persian; *dvar* is its Sanskrit root, *dvāra*.)

In the industry's words, dvar is a platform's front door: an **identity provider** (single sign-on), an
**identity-aware proxy**, and a **shared application shell** that independent applications wear. The pass is
the session the door gives you. It says who you are and in which environment, and every house reads it the
same way.

## How a visit goes

```
 visitor            Python house                 door (Keycloak + Chowkidar)          Node house
    │  GET /             │                                │                                 │
    │──────────────────▶│ no session: go to the door      │                                 │
    │◀── 302 ───────────│  (code flow, PKCE challenge)    │                                 │
    │  sign-in page ─────────────────────────────────────▶│                                 │
    │  username + password ──────────────────────────────▶│ the door's session (the pass)   │
    │◀── 302 /callback?code=… ───────────────────────────│                                 │
    │  /callback ───────▶│ code + verifier + secret ─────▶│                                 │
    │                    │◀──────────── id_token ─────────│                                 │
    │◀── its own session │                                │                                 │
    │  GET / (Node) ───────────────────────────────────────────────────────────────────────▶│ no session
    │◀── 302 to the door ─────────────────────────────────────────────────────────────────│
    │  ───────────────────────────────────────────────────▶│ the pass is there: no question  │
    │◀── 302 /callback?code=… ───────────────────────────│                                 │
    │  ─────────────────────────────────────────────────────────────────────────────────▶│ code → id_token → its own session
    │  sign out (Python) ▶│ end its session; to the door ─▶│ end the pass                    │
    │                    │                                │── back-channel logout (signed) ▶│ ends its session
```

Each house keeps its own session. The door only proves who the visitor is, and tells every house when the
pass ends.

## The accession

The houses behind the door were each built on their own, with their own sign-in and their own look. To live
behind one door, *"each app gave up its own identity and accepted the domain of the Estate"*.

India's princely states made the same bargain when they acceded to the Union. Each gave up defence, external
affairs and communications, and kept its internal rule. A house gives up three things: who you are (the door
proves it), how it looks at the top (the bar), and how it signs you out (the door tells it). It keeps everything
inside its walls, above all whether you may come in. Some things are offered rather than imposed: a footer with
its version, a print action, the weather. The README lists the rules.

## Utilities serve houses

Some parts of the estate are not houses at all. **bhandara** keeps files and **dakiya** sends mail. They serve
houses, never people directly, so a house reaches them with its own certificate, never with the person's pass.
In the industry this is service identity by mutual TLS, behind a proxy that alone may say who is calling.

## Neenv: the ground it stands on

A door cannot stand on raw ground. *Neenv* (नींव) is the foundation poured before any wall, the ground
prepared before a crop is raised. Neenv is not a product. It is what must already be true, and each layer
carries something dvar leans on:

- **The certificate authority** makes every pass and every service certificate mean something. A browser
  trusts the door, the door trusts a house's back-channel, and the proxy trusts a house's certificate, all
  because each machine trusts one root.
- **DNS** gives each house its name. A name is how a person finds a house, and how the door knows where to
  send them back.
- **The reverse proxy** holds TLS for every name. It verifies a calling house's certificate and hands the
  utility that house's name, clearing the name on every request that brings no certificate.
- **PostgreSQL** holds the door's state and the utilities' state.
- **The public domain** is the door's address, the one place a stranger is sent to sign in.

Dvar is one structure on that ground. Houses, utilities, and whatever is built beyond dvar stand on the same
ground. The demo's compose file is a small neenv you can read in one sitting: a throwaway CA, nginx,
PostgreSQL, an S3 store and a mail sink.

## Nothing here is new

*"There may be others who might enjoy this cocktail even though all ingredients are available separately"*.
Keycloak, nginx, PostgreSQL and a stylesheet are all commodity parts: *"i neither made grapes, nor salt"*. What
is offered is the mix and the rules that hold it together.

The core is open source: Keycloak, nginx, PostgreSQL, and [Chowkidar](https://github.com/ploutosservices/chowkidar),
[bhandara](https://github.com/ploutosservices/bhandara) and [dakiya](https://github.com/ploutosservices/dakiya)
under Apache-2.0. A house that is not open source may still join under the same rules.

*"umesh speaks, ploutos owns"*: the words quoted here are his, and the work belongs to Ploutos Services LLC.
