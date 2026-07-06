# Palantir Java Format Worker

Extension VS Code de formatage Java locale, fondée sur
[Palantir Java Format](https://github.com/palantir/palantir-java-format).

> **Projet communautaire non officiel.** Cette extension n’est ni développée,
> ni approuvée, ni sponsorisée par Palantir Technologies. Palantir et Palantir
> Java Format sont des marques ou projets appartenant à leurs détenteurs
> respectifs.

**Bundled Palantir Java Format version: 2.91.0**

L’extension enregistre un provider de formatage de document Java. Elle lance à
la demande un unique worker Java persistant et lui transmet les documents par
un protocole JSONL versionné sur `stdin`/`stdout`. Aucun port réseau et aucun
appel réseau ne sont utilisés pendant le formatage.

## Prérequis

- VS Code 1.96 ou ultérieur ;
- un JDK 17 ou ultérieur.

Maven, Gradle et un dépôt Palantir ne sont pas requis sur la machine de
l’utilisateur. Le VSIX contient le worker et Palantir Java Format 2.91.0 dans
un fat JAR.

Java est recherché dans cet ordre :

1. `palantirJavaFormat.javaHome` ;
2. `JAVA_HOME` ;
3. `java` (`java.exe` sous Windows) dans le `PATH`.

`javaHome` doit désigner la racine du JDK, et non le binaire. La version est
contrôlée avant le démarrage du worker.

## Configuration

```json
{
  "[java]": {
    "editor.defaultFormatter": "lucasfleury.palantir-java-format-worker",
    "editor.formatOnSave": true
  },
  "palantirJavaFormat.enabled": true,
  "palantirJavaFormat.javaHome": "",
  "palantirJavaFormat.jvmArgs": []
}
```

La version de Palantir est volontairement fixe. `jvmArgs` est un tableau :
chaque entrée est passée comme un argument distinct à la JVM, avant `-jar`.

Le formatage complet applique
`FormatterService.formatSourceReflowStringsAndFixImports` : mise en forme,
réorganisation et espacement des imports, suppression des imports inutilisés
et traitement standard des chaînes longues.

## Commandes

- `Palantir Java Format: Restart Worker`
- `Palantir Java Format: Show Output`
- `Palantir Java Format: Show Version`

Les diagnostics de l’extension et `stderr` du worker sont visibles dans le
canal de sortie **Palantir Java Format**. Le code source complet n’est jamais
journalisé.

## Support

Les bugs et demandes d’évolution sont suivis dans les
[issues GitHub](https://github.com/Lucas-Fle/palantir-java-formatter-vscode/issues).
Avant d’ouvrir une issue, consulter le canal de sortie
**Palantir Java Format** et joindre la version de VS Code, celle du JDK, les
paramètres `palantirJavaFormat` utilisés et les logs pertinents sans code source
confidentiel.

## Architecture

```text
VS Code / TypeScript
    │ JSONL v1 sur stdin/stdout
    ▼
worker Java persistant
    │ ServiceLoader<FormatterService>
    ▼
Palantir Java Format 2.91.0
```

- `extension/` contient le provider VS Code, le client protocolaire et le
  cycle de vie du processus ;
- `worker/` est le projet Maven Java 17 produisant le JAR exécutable ;
- `protocol/protocol.schema.json` décrit les messages ;
- `scripts/` automatise le build, les contrôles de version et le VSIX.

Le worker appartient à l’Extension Host : il démarre paresseusement, reste
actif entre les sauvegardes et s’arrête avec l’extension. Après un crash, les
requêtes pendantes sont rejetées et au plus trois redémarrages automatiques
avec backoff sont tentés.

## Développement

```shell
npm install
npm run build:worker
npm run copy:worker
npm run build:extension
npm test
```

Le Maven Wrapper télécharge Maven 3.9.11 ; aucune installation globale de
Maven n’est nécessaire :

```shell
cd worker
./mvnw clean package
```

Sous Windows :

```powershell
cd worker
.\mvnw.cmd clean package
```

Pour tester avec `F5`, exécuter d’abord `npm install` puis la tâche
`Build for F5`. La configuration `Run Extension` ouvre un Extension
Development Host.

La commande complète demandée pour tester, construire et empaqueter est :

```shell
npm run package
```

Elle :

1. compile et teste le worker avec le Maven Wrapper ;
2. sonde réellement le fat JAR avec `java -jar` et vérifie la version
   Palantir annoncée ;
3. refuse un JAR absent ou plus ancien que les sources ;
4. exécute lint, type-check, tests TypeScript et tests VS Code ;
5. crée `artifacts/<nom-extension>-<version>.vsix` ;
6. inspecte le VSIX et échoue si le worker n’y figure pas.

Sous Linux sans session graphique, lancer les tests VS Code avec Xvfb, comme
dans la CI.

## Protocole

Chaque ligne est un objet JSON UTF-8. Les méthodes v1 sont `initialize`,
`formatDocument` et `shutdown`. Toute requête possède un identifiant unique ;
les erreurs portent un code stable. `stdout` est réservé au protocole et les
logs vont sur `stderr`.

Voir [protocol/protocol.schema.json](protocol/protocol.schema.json).

## Crédits et licence

Les principes du worker persistant et de l’organisation d’extension ont été
étudiés dans les projets Dokimos et google-java-format-for-vs-code cités dans
la demande initiale. Aucun code de ces extensions n’a été copié.

Ce projet est sous licence Apache-2.0. Les licences et attributions des
composants embarqués sont conservées dans les artefacts distribués et
documentées dans [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
