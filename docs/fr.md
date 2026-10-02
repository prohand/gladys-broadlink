# Broadlink

Pilotez vos appareils Broadlink **en local** depuis Gladys : pas de compte
Broadlink, pas de cloud. L'intégration parle directement aux appareils sur
votre réseau (UDP, port 80).

## Appareils pris en charge

| Famille                    | Modèles (exemples)                                | Dans Gladys                                       |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Télécommandes universelles | RM mini 3, RM pro / pro+, RM4 mini, RM4C, RM4 pro | Un bouton par code IR/RF + température / humidité |
| Prises connectées          | SP1, SP2, SP mini, SP3, SP3S, SP4L, SP4M, MCB1…   | Marche/arrêt (+ puissance sur SP2S, SP3S, SP4B)   |
| Multiprise                 | MP1                                               | 4 prises pilotables                               |
| Capteur d'environnement    | A1                                                | Température, humidité                             |

- La température / humidité d'un RM4 n'apparaît que si le câble capteur
  (HTS2) est branché. Le RM pro (RM2) a un capteur de température intégré.
- L'apprentissage radio (RF 433/315 MHz) n'est possible que sur les modèles
  **pro** (RM pro, RM4 pro).

## Avant de commencer

Il faut **Gladys 5.1.0 ou plus récent**.

1. Installez vos appareils sur votre Wi-Fi avec l'application **Broadlink**
   (ou BroadLink / IHC).
2. Dans l'application, ouvrez les paramètres de chaque appareil et
   **désactivez « Verrouiller l'appareil »**. Un appareil verrouillé refuse
   toute commande locale : l'intégration l'ignore.
3. Conseillé : donnez une **IP fixe** à chaque appareil (réservation DHCP sur
   votre box ou votre routeur).

## Ajouter les appareils

1. Ouvrez l'onglet **Découverte** de l'intégration et lancez un **scan**.
2. Gladys envoie une requête de découverte (broadcast UDP port 80) sur votre
   réseau local ; les appareils trouvés apparaissent.
3. Ajoutez ceux que vous voulez.

Chaque appareil affiche un badge **local** quand il répond, ou
**injoignable** quand il ne répond plus (débranché, IP changée…).

Un appareil n'apparaît pas ? Il est sans doute sur un autre réseau / VLAN, ou
le broadcast est filtré. Dans l'onglet **Configuration**, renseignez son
adresse IP dans **Adresses IP des appareils** (plusieurs adresses séparées par
des virgules), enregistrez, puis relancez le scan.

## Codes de télécommande (IR / RF)

Chaque code enregistré sur une télécommande RM devient un **bouton** de
l'appareil dans Gladys : l'activer envoie le code, puis il revient tout seul
à « arrêt ». Vous pouvez l'utiliser sur le tableau de bord et dans les scènes
(action « Contrôler un appareil »).

Dans les scènes, l'action **« Envoyer un code Broadlink »** envoie aussi un
code par son nom (télécommande + nom du code, avec un nombre de répétitions
optionnel), sans passer par un bouton.

Les actions se trouvent dans l'onglet **Configuration** :

- **Apprendre un code**
  - Choisissez la télécommande, donnez un nom (ex. « Allumer télé »), puis
    choisissez **Infrarouge** ou **Radio**.
  - Infrarouge : cliquez sur le bouton, puis dans les 30 secondes appuyez sur
    la touche de votre télécommande d'origine, pointée vers le Broadlink.
  - Radio : **maintenez** la touche appuyée jusqu'à ce que la fréquence soit
    trouvée (jusqu'à 30 s), relâchez-la, puis appuyez **une fois**
    brièvement.
- **Importer un code** : collez un code Broadlink existant, en base64
  (format Home Assistant, commence par `JgB`) ou en hexadécimal.
- **Envoyer un code** : pour tester un code par son nom.
- **Lister les codes enregistrés** / **Supprimer un code**.
- **Lister les appareils trouvés** : nom, modèle, IP et MAC de chaque
  appareil (utile pour le dépannage).

Après avoir appris, importé ou supprimé un code, ouvrez l'onglet
**Découverte** et cliquez sur **Mettre à jour** sur la télécommande pour que
le bouton apparaisse (ou disparaisse).

Les codes sont stockés dans le volume de données de l'intégration
(`/data/codes.json`) : ils survivent aux mises à jour.

## Réglages

- **Adresses IP des appareils** : seulement si le scan ne trouve pas un
  appareil.
- **Intervalle de rafraîchissement** : fréquence de lecture de l'état des
  prises et des capteurs (60 s par défaut, de 10 à 3600 s).

## Dépannage

- **Un appareil n'est pas trouvé** : vérifiez qu'il répond au ping, qu'il est
  sur le même réseau que Gladys, ou renseignez son IP dans la configuration.
- **« Authentication failed » / l'appareil ne répond pas aux commandes** :
  l'appareil est verrouillé dans l'application Broadlink, désactivez le
  verrouillage.
- **Un code IR n'est pas capté** : rapprochez la télécommande d'origine
  (5 à 10 cm) et visez le haut du Broadlink.
- **Logs** : consultez les logs de l'intégration depuis Gladys (ou
  `docker logs`), avec `LOG_LEVEL=debug` pour le détail.
