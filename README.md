# Gladys Broadlink

Intégration externe [Gladys Assistant](https://gladysassistant.com) pour les
appareils **Broadlink**, 100 % locale (aucun compte ni cloud Broadlink).
Nécessite **Gladys ≥ 5.1.0**.

Construite à partir du template officiel
[`GladysAssistant/integration-template-js`](https://github.com/GladysAssistant/integration-template-js)
et du SDK [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).
Le protocole est réimplémenté en JavaScript d'après
[python-broadlink](https://github.com/mjg59/python-broadlink) (aucune
dépendance en plus du SDK).

## Fonctionnalités

- **Découverte automatique** : le cœur Gladys diffuse la requête de
  découverte Broadlink (manifest `network_discovery`,
  `udp-active-broadcast`, port 80) — le conteneur de l'intégration, en
  réseau bridge, ne peut pas faire de broadcast lui-même. Repli possible sur
  une liste d'IP saisies à la main (autre VLAN…).
- **Télécommandes RM** (RM mini 3, RM pro, RM4 mini, RM4 pro…) :
  - apprentissage de codes **IR** et **RF** (modèles pro), import de codes
    existants (base64 Home Assistant ou hexa) ;
  - chaque code devient un bouton (interrupteur momentané) utilisable sur le
    tableau de bord et dans les scènes ;
  - action de scène « Envoyer un code Broadlink » (code par son nom,
    répétitions) ;
  - température / humidité (RM pro, RM4 + câble HTS2).
- **Prises SP** (SP1, SP2, SP mini, SP3, SP3S, SP4…) : marche/arrêt avec
  retour d'état, puissance instantanée sur SP2S / SP3S / SP4B.
- **Multiprise MP1** : 4 prises pilotables.
- **Capteur A1** : température et humidité.

La documentation utilisateur est dans [`docs/fr.md`](./docs/fr.md) /
[`docs/en.md`](./docs/en.md) (affichée par Gladys dans l'écran de
configuration).

## Structure du projet

```
.
├─ index.js                          # câblage SDK <-> logique (aucune logique métier)
├─ src/
│  ├─ integration.js                 # logique : scan, commandes, actions du manifest
│  ├─ discovery.js                   # découverte (scan via Gladys + IP manuelles)
│  ├─ registry.js                    # appareils connus + un client par appareil
│  ├─ codes.js                       # stockage des codes IR/RF dans /data
│  ├─ learning.js                    # apprentissage IR / RF
│  ├─ config.js                      # valeurs par défaut + normalisation
│  ├─ broadlink/                     # protocole Broadlink (pur JS)
│  │  ├─ protocol.js                 #   paquets, checksums, AES-128-CBC
│  │  ├─ udp.js                      #   requête/réponse UDP
│  │  ├─ client.js                   #   session authentifiée avec un appareil
│  │  ├─ commands.js                 #   commandes RM / SP / MP1 / A1
│  │  └─ models.js                   #   table des modèles (devtype)
│  └─ devices/                       # un fichier par type d'appareil Gladys
│     ├─ remote.js  plug.js  strip.js  sensor.js
│     └─ index.js
├─ test/                             # tests node --test (+ faux appareil UDP)
├─ docs/{fr,en}.md                   # doc utilisateur
├─ gladys-assistant-integration.json # manifest
└─ Dockerfile, .github/workflows/    # image multi-arch + release (du template)
```

## Développement

```bash
npm install
npm test               # tests unitaires (node --test)
npm run lint           # ESLint
npm run format:check   # Prettier
```

Les tests de protocole comparent les paquets générés aux octets produits par
python-broadlink pour les mêmes entrées. Les tests d'intégration font tourner
de faux appareils Broadlink en UDP sur `127.0.0.1`.

Lancer en local contre un Gladys :

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="broadlink" \
BROADLINK_DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

`BROADLINK_DATA_DIR` (défaut `/data`) est le dossier où sont stockés les
codes appris.

Valider le manifest avec les règles du store :

```bash
npx github:GladysAssistant/integration-store .
```

## Publier

1. Ajouter le topic GitHub `gladys-assistant-integration` au dépôt, et le
   rendre public.
2. **Actions → Release → Run workflow** (`patch` / `minor` / `major`) : le
   workflow met à jour la version (package.json + manifest), pose le tag et
   publie l'image `ghcr.io/prohand/gladys-broadlink` (amd64 + arm64).
3. Vérifier que le package GHCR est **public** (sinon le store refuse
   l'image).

## Limites connues

- Pas de prise en charge des ampoules LB1, thermostats Hysen, moteurs de
  volets Dooya, capteurs A2 / S1C : ils sont ignorés au scan.
- Un code appris / supprimé change la structure de l'appareil : il faut
  cliquer sur « Mettre à jour » dans l'onglet Découverte.

## Licence

Apache-2.0
