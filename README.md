# 🃏 Check Game

Jeu de cartes multijoueur en PWA (Progressive Web App).

## Règles

- 54 cartes (52 + 2 Jokers)
- 2 à 6 joueurs
- Chaque joueur reçoit 5 cartes
- Le but : se débarrasser de toutes ses cartes

### Effets des cartes

| Carte | Effet |
|-------|-------|
| 7 | Fait piocher 2 cartes au suivant |
| Joker | Fait piocher 4 cartes au suivant |
| As | Suspend le joueur suivant |
| Valet | Impose une couleur |

### Règle spéciale

**Piocher = fin de tour automatique.**

## Installation

```bash
npm install
cd server && npm install
cd ../client && npm install