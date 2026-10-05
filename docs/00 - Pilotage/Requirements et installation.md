---
tags: [pilotage, setup]
---
# 🧰 Requirements et installation
La liste complète (matériel, logiciels, paquets du Pi, images Docker, bibliothèques PlatformIO, Python et npm) est dans [[Requirements complet]].

## Checklist de mise en route par personne
- [ ] Cloner le dépôt : `gh repo clone JXPM/sentinel_x`
- [ ] Lire les bibliothèques de sa spé dans `REQUIREMENTS.md` du dépôt
- [ ] Générer une clé SSH ed25519 et envoyer la **clé publique** à l'INFRA
- [ ] Installer les outils de sa filière (voir [[Requirements complet]])
- [ ] Se connecter au Wi-Fi `SENTINEL-X-G<n>` et ouvrir `https://192.168.10.1`
- [ ] Installer `ca.crt` (CA locale) dans le navigateur pour éviter l'avertissement HTTPS
