---
tags: [soutenance, vidéo]
---
# 🎞️ Storyboard « Sentinel Drop » (9:16, ≤ 60 s, H.264)

| Temps | Séquence | Plans | Son | Texte à l'écran |
|---|---|---|---|---|
| 0–10 s | **Hook** : la menace | Centrale de nuit (stock ou maquette), flashs rouges, ombre d'un intrus | Sirène, basse | « 2050. Sites isolés. 3 menaces. » |
| 10–30 s | **Produit** | B-roll : rotation du boîtier, gros plans de la gravure laser et du numéro de série, OLED allumé, LEDs | Musique qui monte | « Sentinel-X » |
| 30–50 s | **Démo sur fond vert** | Membres en premier plan, derrière eux : schéma d'architecture animé, code C++ qui défile, **vue YOLO détectant un intrus**, courbe IA | Voix off courte | « TLS · IA locale · < 100 ms » |
| 50–60 s | **Outro** | Équipe alignée face caméra | Coup final | **« Sentinel-X : la sécurité à la bordure. »** + logo AetherCorp |

## Tournage (mercredi après-midi)
- [ ] Captures d'écran et enregistrements de la vraie stack **avant** le tournage (OBS) : dashboard, YOLO, Grafana, code
- [ ] Éclairage uniforme du fond vert, pas de vêtements verts
- [ ] Filmer en **vertical 1080×1920**, plusieurs prises
- [ ] Montage : incrustation (DaVinci Resolve, Delta Keyer), sous-titres, export H.264
- [ ] Vérifier avec `ffprobe` : durée ≤ 60 s, codec h264, 1080×1920
