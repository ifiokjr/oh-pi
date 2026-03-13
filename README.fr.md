<div align="center">

<img src="./logo.svg" width="180" alt="oh-pi logo"/>

# 🐜 oh-pi

**Une seule commande pour booster [pi-coding-agent](https://github.com/badlogic/pi-mono).**

Comme oh-my-zsh pour pi — mais avec une colonie de fourmis autonome.

[![npm](https://img.shields.io/npm/v/oh-pi)](https://www.npmjs.com/package/oh-pi)
[![license](https://img.shields.io/npm/l/oh-pi)](./LICENSE)
[![node](https://img.shields.io/node/v/oh-pi)](https://nodejs.org)

[English](./README.md) | [中文](./README.zh.md) | [Français](./README.fr.md)

```bash
npx oh-pi
```

</div>

---

## Démarrage en 30 secondes

```bash
npx oh-pi    # tout configurer
pi           # commencer à coder
```

oh-pi détecte automatiquement votre environnement, vous guide dans une TUI moderne, puis écrit
`~/.pi/agent/`.

Déjà configuré ? oh-pi détecte les fichiers existants et propose une **sauvegarde avant
écrasement**.

## Valeur en 2 minutes

pi-coding-agent est puissant par défaut, mais la configuration manuelle (fournisseurs, thèmes,
extensions, skills, prompts) prend du temps. oh-pi compresse cette phase en moins d'une minute —
puis ajoute la colonie pour les tâches complexes.

- [`docs/DEMO-SCRIPT.md`](./docs/DEMO-SCRIPT.md) — démo rapide en 2 minutes
- [`ROADMAP.md`](./ROADMAP.md) — positionnement, jalons, métriques
- [`DECISIONS.md`](./DECISIONS.md) — décisions produit et compromis techniques

## Quand ne pas utiliser la colonie

Utilisez le flux pi classique (sans colonie) si la tâche est petite, très exploratoire, ou nécessite
un pilotage humain continu.

## Ce que vous obtenez

```
~/.pi/agent/
├── auth.json            Clés API (permissions 0600)
├── settings.json        Modèle, thème, niveau de réflexion
├── keybindings.json     Raccourcis Vim/Emacs (optionnel)
├── AGENTS.md            Directives IA par rôle
├── extensions/          8 extensions (7 par défaut + colonie)
│   ├── safe-guard       Confirmation des commandes dangereuses + protection des chemins
│   ├── git-guard        Points de contrôle stash auto + alerte dépôt sale
│   ├── auto-session     Nommage de session depuis le premier message
│   ├── custom-footer    Barre d'état améliorée (token/coût/temps/git/cwd)
│   ├── compact-header   Informations de démarrage simplifiées
│   ├── auto-update      Vérification des mises à jour au lancement
│   ├── bg-process       ⏳ **Bg Process** — Mise en arrière-plan automatique des commandes longues (serveurs dev, etc.)
│   └── ant-colony/      🐜 Essaim multi-agents autonome (optionnel)
├── prompts/             10 modèles (/review /fix /commit /test ...)
├── skills/              11 compétences (outils + design UI + workflows)
└── themes/              6 thèmes personnalisés
```

## Modes de configuration

| Mode                | Étapes | Pour                                       |
| ------------------- | ------ | ------------------------------------------ |
| 🚀 **Rapide**       | 3      | Choisir fournisseur → entrer clé → terminé |
| 📦 **Préréglage**   | 2      | Choisir un profil de rôle → entrer clé     |
| 🎛️ **Personnalisé** | 6      | Tout choisir soi-même                      |

### Préréglages

|                | Inclut                                   |
| -------------- | ---------------------------------------- |
| 🟢 **Complet** | Extensions recommandées + colonie + bg-process (`safe-guard` reste optionnel) |
| 🔵 **Propre**  | Aucune extension                         |
| 🟣 **Colonie** | Colonie uniquement                       |

### Fournisseurs

Anthropic · OpenAI · Google Gemini · Groq · OpenRouter · xAI · Mistral ·
[FOXNIO](https://www.foxnio.com) (fournisseur Claude d'intérêt public recommandé)

Détection automatique des clés API depuis les variables d'environnement.

## 🐜 Colonie de fourmis

La fonctionnalité phare. Un essaim multi-agents modelé sur l'écologie réelle des fourmis —
profondément intégré au SDK pi.

```
Vous : "Refactorer l'auth des sessions vers JWT"

oh-pi :
  🔍 Fourmis éclaireuses explorent le code (haiku — rapide, économique)
  📋 Pool de tâches généré à partir des découvertes
  ⚒️  Fourmis ouvrières exécutent en parallèle (sonnet — capable)
  🛡️ Fourmis soldats révisent tous les changements (sonnet — rigoureux)
  ✅ Terminé — rapport auto-injecté dans la conversation
```

### Architecture

Chaque fourmi est une `AgentSession` in-process (SDK pi), pas un sous-processus :

```
pi (processus principal)
  └─ ant_colony tool
       └─ queen.ts → runColony()
            └─ spawnAnt() → createAgentSession()
                 ├─ session.subscribe() → flux de tokens en temps réel
                 ├─ Zéro surcharge de démarrage (processus partagé)
                 └─ Auth et registre de modèles partagés
```

**Mode interactif :** La colonie tourne en arrière-plan — vous continuez à discuter. Un widget en
temps réel affiche la progression, et les résultats sont auto-injectés à la fin.

**Mode print (`pi -p`) :** La colonie tourne de manière synchrone, bloque jusqu'à la fin.

### Pourquoi des fourmis ?

Les vraies colonies de fourmis résolvent des problèmes complexes sans contrôle central. Chaque
fourmi suit des règles simples, communique par **pistes de phéromones**, et la colonie
s'auto-organise. oh-pi reproduit directement ce modèle :

| Fourmis réelles                      | oh-pi                                                     |
| ------------------------------------ | --------------------------------------------------------- |
| L'éclaireuse trouve la nourriture    | L'éclaireuse scanne le code, identifie les cibles         |
| Piste de phéromones                  | `.ant-colony/pheromone.jsonl` — découvertes partagées     |
| L'ouvrière transporte la nourriture  | L'ouvrière exécute la tâche sur les fichiers assignés     |
| Le soldat garde le nid               | Le soldat révise les changements, demande des corrections |
| Plus de nourriture → plus de fourmis | Plus de tâches → concurrence plus élevée (auto-adaptée)   |
| Les phéromones s'évaporent           | Demi-vie de 10 min — les infos obsolètes s'estompent      |

### UI en temps réel

En mode interactif, la colonie affiche la progression en direct :

- **Barre de statut** — footer compact avec métriques réelles : tâches terminées, fourmis actives,
  appels d'outils, tokens de sortie, coût, durée
- **Ctrl+Shift+A** — panneau de détails en overlay avec liste des tâches, flux des fourmis actives
  et journal de la colonie
- **Notification** — résumé à la fin

Utilisez `/colony-stop` pour arrêter une colonie en cours.

### Protocole de signaux

La colonie communique via des signaux structurés, pour éviter toute supposition côté modèle :

| Signal                            | Signification                                    |
| --------------------------------- | ------------------------------------------------ |
| `COLONY_SIGNAL:LAUNCHED`          | Colonie démarrée en arrière-plan                 |
| `COLONY_SIGNAL:SCOUTING`          | Vague d'éclaireuses en exploration/planification |
| `COLONY_SIGNAL:PLANNING_RECOVERY` | Boucle de récupération du plan en cours          |
| `COLONY_SIGNAL:WORKING`           | Exécution des tâches par les ouvrières           |
| `COLONY_SIGNAL:REVIEWING`         | Revue qualité par les soldats                    |
| `COLONY_SIGNAL:TASK_DONE`         | Tâche terminée (jalon de progression)            |
| `COLONY_SIGNAL:COMPLETE`          | Mission terminée, rapport injecté                |
| `COLONY_SIGNAL:FAILED`            | Mission échouée avec diagnostic                  |
| `COLONY_SIGNAL:BUDGET_EXCEEDED`   | Budget maximal atteint                           |

### Contrôle des tours

Chaque fourmi a un budget strict de tours pour éviter les exécutions incontrôlées :

Éclaireuse : 8 tours · Ouvrière : 15 tours · Soldat : 8 tours

### Sélection des modèles

La colonie détecte automatiquement les modèles disponibles et laisse le LLM choisir le meilleur par
rôle :

| Rôle       | Stratégie                                  | Exemple                           |
| ---------- | ------------------------------------------ | --------------------------------- |
| Éclaireuse | Rapide & économique — lecture seule        | `claude-haiku-4-5`, `gpt-4o-mini` |
| Ouvrière   | Capable — modifie le code                  | `claude-sonnet-4-0`, `gpt-4o`     |
| Soldat     | Même que ouvrière ou légèrement moins cher | `claude-sonnet-4-0`               |

Omettez les modèles pour utiliser le modèle de session actuel pour chaque fourmi.

### Rapport de coûts

La colonie suit le coût par fourmi et le total, rapporté dans le résumé final. **Le coût
n'interrompt jamais l'exécution** — les limites de tours et le contrôle de concurrence gèrent les
ressources.

### Déclenchement automatique

Le LLM décide quand déployer la colonie. Vous n'avez pas à y penser :

- **≥3 fichiers** à modifier → colonie
- **Flux parallèles** possibles → colonie
- **Un seul fichier** → exécution directe (pas de surcharge colonie)

### Concurrence adaptative

La colonie trouve automatiquement le parallélisme optimal pour votre machine :

```
Démarrage à froid  →  ceil(max/2) fourmis (démarrage rapide)
Exploration        →  +1 par vague, surveillance du débit
Débit ↓            →  verrouiller l'optimal, stabiliser
CPU > 85%          →  réduire immédiatement
429 rate limit     →  concurrence -1 + backoff (2s→5s→10s max)
Tâches terminées   →  réduire au minimum
```

### Sécurité des fichiers

Une fourmi par fichier. Toujours. Les tâches en conflit sont automatiquement bloquées et reprennent
quand les verrous sont libérés.

## Compétences

oh-pi embarque 11 compétences en trois catégories.

### 🔧 Compétences outils

Scripts Node.js sans dépendances — aucune clé API requise.

| Compétence   | Fonction                                                    |
| ------------ | ----------------------------------------------------------- |
| `context7`   | Interroger la doc à jour des bibliothèques via Context7 API |
| `web-search` | Recherche DuckDuckGo (gratuit, sans clé)                    |
| `web-fetch`  | Extraire le contenu d'une page web en texte brut            |

```bash
# Exemples
./skills/context7/search.js "react"
./skills/web-search/search.js "typescript generics" -n 5
./skills/web-fetch/fetch.js https://example.com
```

### 🎨 Compétences design UI

Spécifications complètes avec tokens CSS, exemples de composants et principes de design. L'agent les
charge quand vous demandez un style visuel spécifique.

| Compétence      | Style                                               | Préfixe CSS |
| --------------- | --------------------------------------------------- | ----------- |
| `liquid-glass`  | Verre translucide Apple WWDC 2025                   | `--lg-`     |
| `glassmorphism` | Flou givré + transparence                           | `--glass-`  |
| `claymorphism`  | Surfaces 3D douces en argile                        | `--clay-`   |
| `neubrutalism`  | Bordures épaisses, ombres décalées, contraste élevé | `--nb-`     |

Chacune inclut `references/tokens.css` avec des propriétés CSS personnalisées prêtes à l'emploi.

```
Vous : "Construire un tableau de bord style liquid glass"
pi charge la compétence liquid-glass → applique les tokens --lg-, effets de verre, reflets
```

### 🔄 Compétences workflow

| Compétence     | Fonction                                             |
| -------------- | ---------------------------------------------------- |
| `quick-setup`  | Détecter le type de projet, générer la config .pi/   |
| `debug-helper` | Analyse d'erreurs, interprétation de logs, profilage |
| `git-workflow` | Branches, commits, PRs, résolution de conflits       |
| `ant-colony`   | Commandes et stratégies de gestion de colonie        |

## Thèmes

|                         |                                |
| ----------------------- | ------------------------------ |
| 🌙 **oh-pi Dark**       | Cyan + violet, contraste élevé |
| 🌙 **Cyberpunk**        | Magenta néon + cyan électrique |
| 🌙 **Nord**             | Palette bleu arctique          |
| 🌙 **Catppuccin Mocha** | Pastel sur fond sombre         |
| 🌙 **Tokyo Night**      | Crépuscule bleu + violet       |
| 🌙 **Gruvbox Dark**     | Tons chauds rétro              |

## Modèles de prompts

```
/review    Revue de code : bugs, sécurité, performance
/fix       Corriger les erreurs avec des changements minimaux
/explain   Expliquer le code, du simple au détaillé
/refactor  Refactorer en préservant le comportement
/test      Générer des tests
/commit    Message Conventional Commit
/pr        Description de Pull Request
/security  Audit de sécurité OWASP
/optimize  Optimisation des performances
/document  Générer la documentation
```

## Modèles AGENTS.md

| Modèle                  | Focus                             |
| ----------------------- | --------------------------------- |
| Développeur généraliste | Directives de codage universelles |
| Développeur full-stack  | Frontend + backend + BDD          |
| Chercheur en sécurité   | Pentest & audit                   |
| Ingénieur Data & IA     | MLOps & pipelines                 |
| 🐜 Opérateur de colonie | Orchestration multi-agents        |

## Aussi un paquet Pi

Passez le configurateur, installez directement les ressources :

```bash
pi install npm:oh-pi
```

Ajoute tous les thèmes, prompts, compétences et extensions à votre configuration pi existante.

## Prérequis

- Node.js ≥ 20
- Au moins une clé API LLM
- pi-coding-agent (installé automatiquement si absent)

## Licence

MIT
