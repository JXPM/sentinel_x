---
tags: [pilotage, backlog]
date: 2026-10-06
---
# 💡 Idées et évolutions

> [!warning] Priorité absolue inchangée
> La chaîne **ESP → serveur → API → dashboard → IA → actionneurs** passe avant tout ([[Accueil]]). Le code est gelé **jeudi 8 au matin** (`v1.0-freeze`) : seules les idées courtes, et une fois la chaîne complète, entrent avant le gel. Les autres visent la **finale nationale du 17 novembre**.

## Vue d'ensemble
| # | Idée | Faisable ? | Effort | Dépend de | Quand |
|---|---|---|---|---|---|
| 1 | Présence à une heure inhabituelle = suspecte | ✅ **fait** (PR #5) | ~2 h | rien (vision seule) | **avant le gel** |
| 2 | Afficher un texte sur l'écran du boîtier depuis le dashboard | ✅ oui | ~3 h à trois | `POST /api/v1/commands` + bridge MQTT, firmware | **avant le gel** si la chaîne commandes marche |
| 3 | Buzzer automatique selon des règles | ✅ oui | ~½ journée | commandes MQTT (idée 2), moteur de règles dans l'API | version minimale avant le gel, complète pour la finale |
| 4 | Onglet « Règles » : modifier les seuils (ex. présence 30 s → 1 min) | ✅ oui | ~½ journée | API (stockage des réglages), `detect.py` relit sa config | version minimale avant le gel, complète pour la finale |
| 5 | Reconnaissance faciale des employés + onglet « Personnel » | ⚠️ techniquement oui, juridiquement très encadré | 1,5 à 2 jours | API (stockage, upload), vision, RGPD | **finale du 17 novembre**, avec analyse RGPD |

---
## 1. Heure inhabituelle
**Idée** : une présence en dehors des heures de travail est plus suspecte qu'en journée.

> [!success] Fait le 2026-10-07 (PR #5), testé de bout en bout vision → API → dashboard

**Heures ouvrées** (décision d'équipe) : **8 h 30-17 h, du lundi au vendredi**. Avant 8 h 30, à partir de 17 h et tout le week-end = hors horaires.

**Ce que fait `detect.py`** : hors horaires, **toute** alerte vision (présence, présence prolongée, objet abandonné) part en **`critical`**, avec un message préfixé « Hors horaires : » et `data.off_hours: true`. Le champ `reason` reste inchangé (une présence prolongée hors horaires reste `loitering`) : aucun changement de schéma ni de contrat. `/video/status` expose aussi `off_hours` pour un futur badge dans le dashboard.

**Options** : `--work-start 08:30`, `--work-end 17:00`, `--work-days 0,1,2,3,4` (0 = lundi). Plus tard, ces plages viendront des réglages de l'idée 4.

**Démo** : forcer une plage déjà passée, passer devant la caméra → bandeau critique.
```bash
.venv/bin/python detect.py --source c270 --no-show --host 0.0.0.0 --work-start 00:00 --work-end 00:01
```

> [!warning] À vérifier sur le serveur
> Le 2026-10-07 à 14 h 30, la vision qui tournait sur le serveur n'était **pas** celle de `main` (pas de `off_hours`). La relancer depuis `main` avant la démo ([[Serveur Windows (option B)]], section 0).

**Point d'attention** : l'heure du laptop doit être juste (NTP), sinon tout est faux. Le mentionner dans [[Serveur Windows (option B)]].

---
## 2. Texte sur l'écran du boîtier
**Idée** : la fonction de test qui affiche un texte quelques secondes sur l'écran du boîtier, pilotable depuis le dashboard (onglet **Commandes**).

> L'écran du boîtier est l'**OLED SSD1306 128×64** ([[Câblage ESP8266]]) : environ 21 caractères × 8 lignes en petite police, 10 × 4 en grande.

**Comment** :
- Dashboard : champ texte (64 caractères max, compteur), durée (1 à 30 s), bouton « Afficher sur le boîtier ».
- API : `POST /api/v1/commands` avec `{"target":"oled","action":"text","text":"Livraison 14h","s":10}` → publié sur `sentinel/sx-001/cmd`. Table `commands` : ajouter `oled` à la contrainte `target`, `text` à `action`, et une colonne `text VARCHAR(64)`.
- Firmware : dans `onCommand`, copier dans un **tampon fixe de 65 octets** (troncature), afficher pendant `s` secondes puis revenir à l'écran normal.

**Sécurité (CYBER, pentest de jeudi)** : validation des deux côtés : API (longueur, caractères imprimables uniquement, durée bornée) **et** ESP (tampon fixe, jamais de `strcpy` sans limite), commande réservée aux comptes connectés, chaque texte journalisé dans `commands`. Un message MQTT trop long est déjà bloqué par `message_size_limit`.

**Démo** : taper « Bonjour le jury » dans le dashboard → il s'affiche sur le boîtier. Très parlant.

---
## 3. Buzzer automatique selon des règles
**Idée** : le buzzer sonne tout seul quand certaines situations arrivent, et l'entreprise choisit lesquelles.

**Comment** : un **moteur de règles dans l'API**, là où vit déjà le moteur de fusion PIR + caméra ([[API REST et WebSocket]]). À chaque alerte reçue, l'API évalue les règles actives et publie les commandes correspondantes.

| Règle (exemple) | Si… | Alors… |
|---|---|---|
| Objet dangereux | alerte `danger_object` | buzzer 3 s + LED rouge fixe |
| Intrusion confirmée | alerte `fusion` critique | buzzer 2 s |
| Hors horaires | présence `off_hours` | buzzer 1 s + texte « ZONE SURVEILLÉE » sur l'OLED |
| Surchauffe prédite | alerte IA `overheat` | LED rouge, **pas** de buzzer |

Le dashboard a déjà un interrupteur « réponse automatique » (onglet Commandes) : il devient l'interrupteur général des règles.

> [!important] Cohérence avec le sujet
> Les règles décident **de la réaction** (sonner, allumer, afficher), jamais **de la détection** : l'anomalie environnementale reste décidée par le modèle IA, pas par un `if temp > 40` ([[IA]]). C'est l'argument à donner au jury.

**Version minimale avant le gel** : 3 règles fixes en base, activables ou non depuis le dashboard. **Version complète** : création de règles libres (idée 4).

---
## 4. Onglet « Règles » : seuils modifiables
**Idée** : changer un seuil sans toucher au code, par exemple la présence prolongée de 30 s à 1 min.

**Réglages concernés** (aujourd'hui en options de `detect.py`) :
| Réglage | Actuel | Exemple |
|---|---|---|
| Présence prolongée (`--loiter`) | 30 s | 60 s |
| Objet abandonné (`--abandon`) | 20 s | 45 s |
| Images de confirmation (`--confirm`) | 3 | 5 |
| Seuil objets dangereux (`--obj-conf`) | 0,35 | 0,30 |
| Heures ouvrées (idée 1) | lun-ven 7 h-20 h | lun-sam 6 h-22 h |
| Règles d'actions (idée 3) | — | buzzer sur objet dangereux : oui/non, durée |

**Comment** :
- Table `settings` (clé, valeur JSON, modifié par, date) ; `GET` et `PUT /api/v1/settings` (le `PUT` réservé à un compte administrateur, chaque changement journalisé).
- `detect.py` relit `GET /api/v1/settings` toutes les 10 s : le changement s'applique **sans redémarrer** la vision.
- Onglet « Règles » du dashboard : un formulaire par réglage, avec bornes (ex. présence entre 5 s et 10 min) pour éviter les valeurs absurdes.

**Démo** : passer la présence prolongée de 30 s à 10 s devant le jury, rester devant la caméra → l'alerte arrive plus tôt.

---
## 5. Reconnaissance faciale des employés
**Idée** : une base des employés (photos + informations). Quand la caméra voit un visage connu, son nom et ses informations s'affichent ; un visage inconnu déclenche « personne non reconnue ». Un onglet permet d'ajouter, modifier et supprimer les employés et leurs photos.

### Techniquement : faisable
- Détection de visage **YuNet** + reconnaissance **SFace**, deux modèles ONNX fournis avec OpenCV (déjà installé) : pas de nouvelle dépendance lourde, de l'ordre de 10 à 30 ms par visage sur le CPU, à mesurer.
- Enrôlement : chaque photo est transformée en **gabarit** (vecteur de 128 nombres) ; on compare le visage vu aux gabarits (similarité cosinus, seuil à calibrer).
- Stockage : tables `staff` (nom, fonction, service, actif) et `staff_faces` (gabarit, photo, date) ; API CRUD avec upload d'images ; onglet « Personnel » dans le dashboard.
- Effort réaliste : **1,5 à 2 jours** (pipeline, API d'upload, onglet, calibrage, tests).

### Les vrais obstacles
1. **Juridique (le plus important)** : un gabarit de visage est une **donnée biométrique**, donc une donnée sensible au sens du RGPD (article 9). La CNIL encadre très strictement la biométrie sur le lieu de travail : besoin de sécurité renforcé à justifier, analyse d'impact (AIPD) obligatoire, information des salariés, durée de conservation, alternative non biométrique. Un jury attentif posera la question.
2. **Sécurité** : une base de visages est une cible de choix pour le pentest. Il faudrait des photos chiffrées, un accès réservé aux administrateurs, aucune photo servie sans authentification.
3. **Fiabilité** : une photo de l'employé sur un téléphone trompe ce type de système (pas de détection du vivant) ; en 640×480, un visage à plus de 2 m devient trop petit.
4. **Calendrier** : impossible à faire proprement avant le gel de jeudi, sans fragiliser la démo obligatoire.

### Recommandation
- **Pas avant la soutenance du 9.** Le présenter dans le pitch comme **évolution prévue, avec son analyse RGPD** : c'est valorisé, et ça montre la maturité de l'équipe.
- **Pour la finale du 17 novembre**, si l'équipe le veut : version démo limitée aux **membres de l'équipe, avec leur consentement écrit**, données uniquement sur le laptop serveur, suppression sur simple demande, AIPD simplifiée dans le dossier.
- Vocabulaire : « personne non reconnue », jamais « intrus » ; le système signale, un humain décide.

---
## Ordre proposé
1. **Mercredi matin** : chaîne complète (éliminatoire), dont `POST /api/v1/commands` et le bridge MQTT.
2. **Mercredi après-midi** : idée 1 (IA), idée 2 (DEV firmware + API + dashboard), version minimale des idées 3 et 4.
3. **Jeudi** : gel, pentest. Rien de nouveau.
4. **Après le 9** : versions complètes des idées 3 et 4, puis idée 5 si l'analyse RGPD est faite.

## Questions à trancher en équipe
- [ ] Qui prend l'idée 2 côté firmware ?
- [x] Heures ouvrées par défaut pour la démo ? → **8 h 30-17 h, lundi-vendredi**
- [ ] Rôles : faut-il un compte « administrateur » distinct de « opérateur » pour les règles et le personnel ?
- [ ] Idée 5 : l'équipe veut-elle la porter jusqu'à la finale ?
