# Contribuer

Les corrections ciblées et les améliorations accompagnées d’un cas d’usage
concret sont les bienvenues. Pour une évolution importante ou un changement de
protocole, ouvrir d’abord une issue afin de valider le périmètre.

## Environnement

- Node.js 22 ;
- JDK 17 ou ultérieur ;
- Git.

Installer les dépendances puis lancer la vérification complète :

```shell
npm ci
npm run package
```

Sous Linux sans session graphique :

```shell
xvfb-run -a npm run package
```

## Pull requests

- limiter chaque pull request à un objectif cohérent ;
- ajouter ou adapter les tests lorsque le comportement change ;
- conserver la compatibilité du protocole v1, ou documenter explicitement toute
  rupture nécessitant une nouvelle version ;
- ne pas modifier directement `extension/src/generatedMetadata.ts`, généré par
  `npm run generate:metadata` ;
- mettre à jour le README ou le changelog lorsque le comportement utilisateur
  change.

Les contributions doivent pouvoir être distribuées sous la licence Apache-2.0
du projet.
