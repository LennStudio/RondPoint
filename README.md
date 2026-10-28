# Rond Point ou Fake

Jeu PWA : deux images par tour, une vraie photo de rond-point et une image générée par IA. Il faut trouver la vraie.
**Mort subite** : une seule erreur et la partie s'arrête. Trois niveaux de difficulté.

## Lancer

Un service worker et `fetch()` exigent un serveur HTTP (pas `file://`). N'importe quel serveur statique convient :

```bash
cd rond-point-ou-fake
python3 -m http.server 8080      # ou : npx serve   /   extension « Live Server » de VS Code
# puis ouvrir http://localhost:8080
```

## Ajouter tes images

Le dossier `images/` est **vide** : il faut y mettre tes fichiers (jpg, png, webp, avif, svg), puis régénérer la liste.

Le **nom du fichier** indique le type et, pour les images IA, le niveau :

| Nom | Type | Niveau |
|---|---|---|
| `real-01.jpg` | vraie photo | tous les niveaux |
| `real-hard-02.jpg` | vraie photo | difficile uniquement (optionnel) |
| `fake-easy-01.png` | image IA grossière | facile |
| `fake-medium-01.png` | image IA crédible | moyen |
| `fake-hard-01.png` | image IA très réussie | difficile |
| `fake-07.png` | image IA sans niveau | moyen (par défaut) |

Puis :

```bash
python3 tools/build_images_json.py
```

Le script écrit `data/images.json` (champ `difficulty` inclus) et affiche le nombre de tours possibles par niveau. Tu peux aussi éditer le JSON à la main :

```json
{ "version": 2,
  "real": [ { "id": "real-01", "src": "images/real-01.jpg" } ],
  "fake": [ { "id": "fake-hard-01", "src": "images/fake-hard-01.png", "difficulty": "hard" } ] }
```

Un tour demande 1 vraie photo et 1 image IA du niveau choisi, jamais revues. Prévois donc autant d'images IA que de vraies photos, pour chaque niveau. Les vraies photos sont partagées entre les niveaux : une photo vue en facile ne reviendra pas en moyen.

## Fonctionnalités

- Niveaux Facile / Moyen / Difficile, avec un record par niveau.
- Mort subite : la première mauvaise réponse termine la partie. Bonne réponse : +100 points, +25 par victoire consécutive (jusqu'à +250).
- Thème sombre, clair ou automatique.
- Mode daltonien : bleu et orange à la place du jaune et du rose, avec des symboles ✓ / ✕ et une pastille « Ton choix » en plus des couleurs.
- Sons (synthétisés, aucun fichier) et vibrations discrets, coupables d'un clic avec le bouton haut-parleur.
- Historique des parties et images déjà vues mémorisés dans `localStorage` (clé `rondpointoufake:v2`).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | Interface et jeu |
| `manifest.json` | Manifeste PWA |
| `sw.js` | Cache hors ligne (incrémenter `VERSION` après avoir changé les fichiers) |
| `data/images.json` | Liste des images (id, chemin, niveau) |
| `images/` | Toutes les images |
| `icons/` | Icônes (depuis `icon.svg`) |
| `tools/build_images_json.py` | Génère `data/images.json` |
