# Rond Point ou Fake

Jeu PWA : trois images par tour, une seule vraie photo de rond-point, deux images générées par IA.

## Lancer

Un service worker et `fetch()` exigent un serveur HTTP (pas `file://`) :

```bash
cd rond-point-ou-fake
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Remplacer les images d'exemple

Les 36 images de `images/` sont des **placeholders** (schémas de ronds-points). Remplace-les par tes vraies photos et tes images IA.

1. Mets tous les fichiers dans `images/` (jpg, png, webp, avif, svg).
2. Nomme-les par préfixe : `real-01.jpg`, `real-02.jpg`… pour les vraies photos, `fake-01.png`, `fake-02.png`… pour les images IA.
3. Supprime les anciens placeholders `.svg`, puis régénère la liste :

```bash
python3 tools/build_images_json.py
```

Il faut au moins 1 vraie photo et 2 images IA par tour : prévois idéalement 2 fois plus d'images IA que de vraies photos.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | Interface et jeu |
| `manifest.json` | Manifeste PWA |
| `sw.js` | Cache hors ligne |
| `data/images.json` | Liste des images (id, chemin) |
| `images/` | Toutes les images |
| `icons/` | Icônes (depuis `icon.svg`) |

## Données enregistrées (localStorage, clé `rondpointoufake:v1`)

Images déjà vues (jamais rejouées), historique des parties, meilleur score / meilleure série, partie en cours.
